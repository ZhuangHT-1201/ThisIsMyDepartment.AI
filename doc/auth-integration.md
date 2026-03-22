# ThisIsMyDepartment.AI Auth Integration Guide

This document explains how a host institution can connect its existing login system to the backend in this repository.

## Choose your login mode

Pick one primary mode based on where trust already exists in your deployment:

1. Shared-secret POST handoff: best when your upstream website or adapter service can make a trusted request directly to this backend.
2. JWT handoff: best when your upstream system already issues HS256 tokens and you want the backend to verify them.
3. Reverse-proxy headers: best when SSO terminates at Nginx, Apache, Traefik, or a campus gateway in front of the backend.
4. `postMessage` bridge: best when the app is embedded in another portal or login must complete in a popup.

Practical recommendation:

* start from [server/.env.production.example](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/server/.env.production.example)
* configure only the variables needed for your chosen auth mode
* keep the institution-specific verification logic in a small upstream adapter instead of modifying the browser client

## Minimum operator checklist

Before wiring the frontend to a real login system, make sure you can answer these questions:

* which system is the source of truth for user identity
* which exact field becomes `externalId`
* which origin or proxy is allowed to inject auth into ThisIsMyDepartment.AI
* which route the user should land on after login
* whether the backend should trust a shared secret, JWT, reverse-proxy headers, or a `postMessage` bridge

## Supported modes

The backend currently supports these auth entry paths:

1. `POST /auth/handoff` with a shared secret
2. `POST /auth/handoff` with a signed HS256 JWT
3. `GET /auth/proxy-login` with reverse-proxy authenticated headers
4. `GET /auth/postmessage-bridge` for iframe or popup embedding flows

The backend normalizes all of these inputs into the same internal user/session model.

## Normalized identity shape

No matter which mode is used, the backend expects to resolve these core fields:

```json
{
  "externalProvider": "campus-sso",
  "externalId": "2026001234",
  "displayName": "Jane Doe",
  "email": "jane@example.edu",
  "organization": "Example University",
  "department": "Industrial Engineering",
  "roles": ["member"]
}
```

Required fields:

* `externalProvider`
* `externalId`
* `displayName`

## Mode 1: Shared-secret POST handoff

Use this when the upstream website can make a trusted server-to-server request or submit a signed POST into the backend.

### Backend configuration

Set:

* `AUTH_HANDOFF_SHARED_SECRET`

### Example request

```bash
curl -X POST http://127.0.0.1:8787/auth/handoff \
  -H 'Content-Type: application/json' \
  -H 'x-thisismydepartment-handoff-secret: your-shared-secret' \
  --data-binary '{
    "identity": {
      "externalProvider": "campus-sso",
      "externalId": "2026001234",
      "displayName": "Jane Doe",
      "email": "jane@example.edu",
      "organization": "Example University",
      "department": "Industrial Engineering",
      "roles": ["member"]
    }
  }'
```

You can also send `sharedSecret` in the body, but the request header is cleaner for server-to-server integration.

## Mode 2: JWT handoff

Use this when the upstream site already issues a signed token and you want the backend to verify it directly.

### Backend configuration

Set:

* `AUTH_JWT_SHARED_SECRET`
* `AUTH_JWT_ISSUER` (optional but recommended)
* `AUTH_JWT_AUDIENCE` (optional but recommended)

### Supported JWT rules

Current implementation:

* expects `HS256`
* verifies the signature with `AUTH_JWT_SHARED_SECRET`
* validates `exp` if present
* validates `nbf` if present
* validates `iss` and `aud` when configured

### Supported claim aliases

The backend currently accepts these common mappings:

* provider: `externalProvider`, `external_provider`, `provider`
* external ID: `externalId`, `external_id`, `sub`, `user_id`, `username`
* display name: `displayName`, `display_name`, `name`, `preferred_username`
* roles: `roles`, `role`

### Example request

```bash
curl -X POST http://127.0.0.1:8787/auth/handoff \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <jwt>' \
  --data-binary '{}'
```

You can also send the token in a JSON body field named `token`.

## Mode 3: Reverse-proxy headers

Use this when an upstream reverse proxy or gateway already authenticated the user and can inject trusted headers into the backend request.

### Backend configuration

Set at least:

* `AUTH_PROXY_PROVIDER`
* `AUTH_PROXY_EXTERNAL_ID_HEADER`
* `AUTH_PROXY_DISPLAY_NAME_HEADER`

Optional:

* `AUTH_PROXY_EMAIL_HEADER`
* `AUTH_PROXY_ORGANIZATION_HEADER`
* `AUTH_PROXY_DEPARTMENT_HEADER`
* `AUTH_PROXY_ROLES_HEADER`
* `AUTH_PROXY_AUTHENTICATED_HEADER`
* `AUTH_PROXY_AUTHENTICATED_VALUE`

### Example configuration

```bash
AUTH_PROXY_PROVIDER=campus-sso
AUTH_PROXY_EXTERNAL_ID_HEADER=x-user-id
AUTH_PROXY_DISPLAY_NAME_HEADER=x-display-name
AUTH_PROXY_EMAIL_HEADER=x-user-email
AUTH_PROXY_ORGANIZATION_HEADER=x-user-org
AUTH_PROXY_DEPARTMENT_HEADER=x-user-department
AUTH_PROXY_ROLES_HEADER=x-user-roles
AUTH_PROXY_AUTHENTICATED_HEADER=x-authenticated
AUTH_PROXY_AUTHENTICATED_VALUE=true
```

### Example Nginx proxy block

```nginx
location = /auth/proxy-login {
  proxy_pass http://127.0.0.1:8787;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header x-authenticated true;
  proxy_set_header x-user-id $sso_user_id;
  proxy_set_header x-display-name $sso_display_name;
  proxy_set_header x-user-email $sso_email;
  proxy_set_header x-user-org $sso_org;
  proxy_set_header x-user-department $sso_department;
  proxy_set_header x-user-roles $sso_roles;
}
```

Before forwarding to the backend, make sure your proxy clears any client-supplied copies of those headers.

### Example request

```bash
curl 'http://127.0.0.1:8787/auth/proxy-login?returnTo=http://127.0.0.1:8000/' \
  -H 'x-authenticated: true' \
  -H 'x-user-id: 2026001234' \
  -H 'x-display-name: Jane Doe' \
  -H 'x-user-email: jane@example.edu' \
  -H 'x-user-org: Example University' \
  -H 'x-user-department: Industrial Engineering' \
  -H 'x-user-roles: member,teacher'
```

The backend will create the app session and return a cookie. For browser requests that accept HTML, the route redirects to the `returnTo` URL.

## How this relates to institution-specific adapters

Institution-specific upstream login handling should stay outside the public game repository.

For open-source hosting, the recommended pattern is:

1. Keep those institution-specific checks outside the game frontend.
2. Convert the verified upstream identity into one of the normalized backend auth modes above.
3. Let the backend create the ThisIsMyDepartment.AI session.

That means a deployment can keep custom AES, signature, or SSO validation logic in a small adapter service without modifying the game client or shipping institution-specific scripts in the public repo.

## Mode 4: iframe or popup postMessage bridge

Use this when your app is embedded in another site or you open a popup window to finish login.

### Backend configuration

Set:

* `AUTH_POSTMESSAGE_ALLOWED_ORIGINS`

This must be a comma-separated list of allowed parent origins, for example:

```bash
AUTH_POSTMESSAGE_ALLOWED_ORIGINS=https://portal.example.edu,https://sso.example.edu
```

The bridge rejects all messages if this list is empty.

### Bridge URL

```text
/auth/postmessage-bridge?returnTo=http://127.0.0.1:8000/&redirect=0
```

Query parameters:

* `returnTo`: where to redirect after success
* `redirect=0`: disable automatic in-frame redirect and only post the success result back
* `close=1`: close a popup window after success instead of redirecting

### Parent window protocol

The bridge sends a ready event to the parent or opener:

```js
{ type: "thisismydepartment-auth-ready", origin: "https://timd.example.edu", returnTo: "..." }
```

The parent should then send:

```js
iframe.contentWindow.postMessage({
  type: "thisismydepartment-auth-handoff",
  payload: {
    token: "<jwt>"
  }
}, "https://timd.example.edu");
```

Or, with direct identity plus shared secret:

```js
iframe.contentWindow.postMessage({
  type: "thisismydepartment-auth-handoff",
  payload: {
    sharedSecret: "your-shared-secret",
    identity: {
      externalProvider: "campus-sso",
      externalId: "2026001234",
      displayName: "Jane Doe"
    }
  }
}, "https://timd.example.edu");
```

On completion, the bridge posts back:

```js
{ type: "thisismydepartment-auth-result", ok: true, bootstrap: {...}, returnTo: "..." }
```

Or on failure:

```js
{ type: "thisismydepartment-auth-result", ok: false, error: "..." }
```

### Example parent page

```html
<button id="launch-login">Sign in</button>
<script>
  document.getElementById("launch-login").addEventListener("click", () => {
    const popup = window.open(
      "https://timd.example.edu/auth/postmessage-bridge?returnTo=https%3A%2F%2Ftimd.example.edu%2F&close=1&redirect=0",
      "timd-login",
      "width=640,height=720"
    );

    window.addEventListener("message", function onMessage(event) {
      if (event.origin !== "https://timd.example.edu") {
        return;
      }
      if (event.data?.type === "thisismydepartment-auth-ready") {
        popup?.postMessage({
          type: "thisismydepartment-auth-handoff",
          payload: {
            token: window.sessionStorage.getItem("campusJwt")
          }
        }, event.origin);
      }
      if (event.data?.type === "thisismydepartment-auth-result") {
        window.removeEventListener("message", onMessage);
        if (event.data.ok) {
          window.location.reload();
        }
      }
    });
  });
</script>
```

## Current naming cleanup status

Public-facing branding now uses ThisIsMyDepartment.AI. The core runtime class has been renamed to `ThisIsMyDepartmentApp`, the live browser entry is [src/main/ThisIsMyDepartmentApp.ts](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/src/main/ThisIsMyDepartmentApp.ts), and the default shared room names and browser media preference keys now use ThisIsMyDepartment.AI-specific values.
