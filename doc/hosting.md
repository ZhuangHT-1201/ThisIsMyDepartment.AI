# ThisIsMyDepartment.AI Hosting Guide

This document explains the current deployment shape of the repository and the minimum pieces needed to host it for a department or organization.

If you have not run the project locally yet, start with [doc/getting-started.md](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/doc/getting-started.md) first. If you want a summary of what is already implemented versus still incomplete, read [doc/current-status.md](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/doc/current-status.md).

Configuration templates live in [.env.example](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/.env.example), [server/.env.local.example](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/server/.env.local.example), and [server/.env.production.example](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/server/.env.production.example).

## Deployment shape

The current app is split into two parts:

1. frontend client
2. backend service

The frontend renders the world and talks to the backend for:

* bootstrap and session resolution
* profile and avatar persistence
* activity logging
* AI agent chat
* prompt overrides

## Minimum local setup

### Frontend

Use the root package:

```bash
npm install
npm run compile
npm start
```

Notes:

* the legacy frontend stack in this repository is tied to older Node tooling
* this repo has previously been validated with Node 16.20.2 via Volta
* the root `npm install` now also installs backend dependencies under `server/`

### Backend

Use the backend package through the root scripts:

```bash
npm run server:install
npm run server:build
npm run server:start
```

Default backend address:

```text
http://127.0.0.1:8787
```

Default persisted database path:

```text
server/data/state.sqlite
```

If `better-sqlite3` needs a native rebuild on macOS under Node 16, ensure `python` is available in `PATH`. Systems that only provide `python3` may need a temporary `python` shim for the rebuild step.

## Important environment variables

### General backend

* `HOST`
* `PORT`
* `AUTH_SESSION_COOKIE_NAME`
* `AUTH_SESSION_TTL_SECONDS`
* `SERVER_STATE_DB_FILE`

### Frontend realtime

Browser builds can inject realtime host settings into the generated `index.html` through these environment variables:

* `TIMD_BACKEND_BASE_URL`
* `TIMD_SOCKET_BASE_URL`
* `TIMD_JITSI_DOMAIN`
* `TIMD_JITSI_MUC`
* `TIMD_JITSI_SERVICE_URL`
* `TIMD_JITSI_CLIENT_NODE`

The frontend webpack config reads these from the root `.env` file, so the usual workflow is to copy [.env.example](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/.env.example) to `.env` and adjust it per deployment.

If you do not set them, the frontend falls back to same-host defaults:

* backend API at the current origin, with `http://127.0.0.1:8787` as a local development fallback
* socket.io at the same origin as the backend, with `http://127.0.0.1:8787/` as the local development fallback when the frontend runs on port `8000`
* Jitsi domain `<current-host>`
* Jitsi MUC `conference.<current-host>`
* Jitsi BOSH path `http(s)://<current-host>/http-bind`
* Jitsi client node `http(s)://<current-host>/jitsimeet`

Important note:

* this repository now includes the authoritative Socket.IO room server implementation inside the backend package
* the remaining production `npm audit` findings in the root package are concentrated in the legacy `socket.io-client` dependency line
* a safe client upgrade still requires coordinated validation against the deployed realtime server protocol, not just package changes in the browser client

### Backend deployment defaults

The backend also exposes deployment defaults for local auth redirects and room metadata:

* `TIMD_FRONTEND_BASE_URL`
* `TIMD_DEFAULT_ORGANIZATION`
* `TIMD_DEFAULT_DEPARTMENT`
* `TIMD_DEFAULT_ROOM_ID`
* `TIMD_DEFAULT_ROOM_DISPLAY_NAME`

### Auth integration

See [doc/auth-integration.md](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/doc/auth-integration.md) for full examples.

Current auth-related variables include:

* `AUTH_HANDOFF_SHARED_SECRET`
* `AUTH_JWT_SHARED_SECRET`
* `AUTH_JWT_ISSUER`
* `AUTH_JWT_AUDIENCE`
* `AUTH_PROXY_PROVIDER`
* `AUTH_PROXY_EXTERNAL_ID_HEADER`
* `AUTH_PROXY_DISPLAY_NAME_HEADER`
* `AUTH_PROXY_EMAIL_HEADER`
* `AUTH_PROXY_ORGANIZATION_HEADER`
* `AUTH_PROXY_DEPARTMENT_HEADER`
* `AUTH_PROXY_ROLES_HEADER`
* `AUTH_PROXY_AUTHENTICATED_HEADER`
* `AUTH_PROXY_AUTHENTICATED_VALUE`
* `AUTH_POSTMESSAGE_ALLOWED_ORIGINS`

Use [server/.env.production.example](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/server/.env.production.example) as the baseline for production deployment. The backend now loads `server/.env.production` automatically when `NODE_ENV=production`, and `SERVER_ENV_FILE` can point to a different env file when a deployment wants explicit control. Shell-provided environment variables still override file values, so service managers and container platforms remain valid deployment paths.

### LLM provider routing

Currently implemented:

* `OPENAI_API_KEY`

If this is not set, the backend falls back to the mock provider path for the configured agents that use mock settings.

Example production environment:

```bash
HOST=127.0.0.1
PORT=8787
AUTH_SESSION_COOKIE_NAME=timd_session
AUTH_SESSION_TTL_SECONDS=28800
SERVER_STATE_DB_FILE=/var/lib/thisismydepartment/state.sqlite
OPENAI_API_KEY=sk-...
AUTH_PROXY_PROVIDER=campus-sso
AUTH_PROXY_EXTERNAL_ID_HEADER=x-user-id
AUTH_PROXY_DISPLAY_NAME_HEADER=x-display-name
AUTH_PROXY_EMAIL_HEADER=x-user-email
AUTH_PROXY_AUTHENTICATED_HEADER=x-authenticated
AUTH_PROXY_AUTHENTICATED_VALUE=true
AUTH_POSTMESSAGE_ALLOWED_ORIGINS=https://portal.example.edu
TIMD_FRONTEND_BASE_URL=https://department.example.edu/
TIMD_DEFAULT_ORGANIZATION=Example University
TIMD_DEFAULT_DEPARTMENT=Industrial Engineering
TIMD_DEFAULT_ROOM_ID=industrial-engineering-main
TIMD_DEFAULT_ROOM_DISPLAY_NAME=Industrial Engineering Department
TIMD_BACKEND_BASE_URL=https://department.example.edu
TIMD_SOCKET_BASE_URL=https://realtime.example.edu/
TIMD_JITSI_DOMAIN=meet.example.edu
TIMD_JITSI_MUC=conference.meet.example.edu
TIMD_JITSI_SERVICE_URL=https://meet.example.edu/http-bind
TIMD_JITSI_CLIENT_NODE=https://meet.example.edu/jitsimeet
```

## Browser-hosted deployment

Recommended shape:

1. host the frontend assets on the same origin as the backend when possible
2. expose the backend under the same domain so cookie sessions behave predictably
3. put upstream auth in front of the backend using one of the supported auth adapter modes
4. route both HTTP and Socket.IO traffic to the same backend service unless you intentionally split them for scaling

Recommended examples:

* `https://department.example.edu/` serves frontend assets
* `https://department.example.edu/api/*` and `https://department.example.edu/auth/*` are routed to the backend

This keeps bootstrap, cookies, and post-login redirects simpler than split-origin hosting.

### Example Nginx layout

```nginx
server {
    listen 443 ssl http2;
    server_name department.example.edu;

    root /srv/thisismydepartment/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /auth/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Electron-hosted deployment

The repo still includes Electron entry points for packaging.

Current state:

* Electron window title and app name now use ThisIsMyDepartment.AI
* the backend still runs as a separate service process in the current implementation

Recommended near-term deployment model:

1. package the frontend Electron shell if desktop distribution is needed
2. point it at a hosted backend or a locally managed backend process
3. keep auth and provider secrets on the backend only

## Persistence

Current backend persistence uses SQLite via:

* [server/src/storage/stateStore.ts](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/server/src/storage/stateStore.ts)

Persisted entities currently include:

* users
* profiles
* sessions
* activities
* conversations
* external identity index

Legacy JSON state from `server/data/state.json` is imported automatically the first time an empty SQLite database starts.

## Reverse proxy recommendations

For production hosting, use a reverse proxy in front of the backend to handle:

* TLS termination
* upstream auth integration
* header filtering and forwarding
* static frontend asset delivery

If you use the reverse-proxy auth mode, be strict about which headers are injected by the proxy and never trust those headers directly from the public internet.

### Example reverse-proxy auth headers

```nginx
location = /auth/proxy-login {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header x-authenticated true;
    proxy_set_header x-user-id $upstream_http_x_user_id;
    proxy_set_header x-display-name $upstream_http_x_display_name;
    proxy_set_header x-user-email $upstream_http_x_user_email;
}
```

In a real deployment, replace those variables with values emitted by your SSO gateway or authentication layer, and strip any same-named headers coming from direct client traffic.

## Embedded auth example

Example parent page flow for the `postMessage` bridge:

```html
<iframe
    id="timd-auth"
    src="https://timd.example.edu/auth/postmessage-bridge?returnTo=https%3A%2F%2Ftimd.example.edu%2F&redirect=0"
    hidden
></iframe>
<script>
    const frame = document.getElementById("timd-auth");
    window.addEventListener("message", (event) => {
        if (event.origin !== "https://timd.example.edu") {
            return;
        }
        if (event.data?.type === "thisismydepartment-auth-ready") {
            frame.contentWindow.postMessage({
                type: "thisismydepartment-auth-handoff",
                payload: {
                    token: window.sessionStorage.getItem("campusJwt")
                }
            }, event.origin);
        }
        if (event.data?.type === "thisismydepartment-auth-result" && event.data.ok) {
            window.location.assign(event.data.returnTo || "/");
        }
    });
</script>
```

## Current limitations

These areas still need more release polish:

* provider configuration docs beyond the current mock plus OpenAI paths
