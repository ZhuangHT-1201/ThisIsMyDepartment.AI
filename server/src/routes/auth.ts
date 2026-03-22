import type { IncomingMessage, ServerResponse } from "http";
import { getServerConfig } from "../config";
import { getConfiguredAuthModes, verifyHandoffPayload, verifyProxyHeaderIdentity } from "../auth/handoff";
import { clearSessionCookie, getSessionIdFromRequest, setSessionCookie } from "../auth/session";
import { parseFormBody, parseJsonBody } from "../http/body";
import { redirect, sendHtml, sendJson } from "../http/response";
import { buildBootstrapResponseForSession, createSessionForVerifiedIdentity, destroySession, getSessionContext } from "../storage/memory/bootstrapStore";

interface HandoffRequestPayload {
    externalProvider?: string;
    externalId?: string;
    displayName?: string;
    email?: string;
    organization?: string;
    department?: string;
    roles?: string[] | string;
    returnTo?: string;
    sharedSecret?: string;
    token?: string;
}

const getClientType = (request: IncomingMessage): "web" | "electron" => {
    const userAgent = request.headers["user-agent"] ?? "";
    return userAgent.toLowerCase().includes("electron") ? "electron" : "web";
};

const parseHandoffRequest = async (request: IncomingMessage): Promise<HandoffRequestPayload> => {
    const contentType = request.headers["content-type"] ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
        return await parseFormBody(request) as HandoffRequestPayload;
    }
    return await parseJsonBody<HandoffRequestPayload>(request);
};

const escapeHtml = (value: string): string => value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

const getDefaultReturnTo = (): string => {
    return getServerConfig().frontendBaseUrl ?? "http://127.0.0.1:8000/";
};

const renderPostMessageBridgePage = (request: IncomingMessage): string => {
        const config = getServerConfig();
        const requestUrl = new URL(request.url ?? "/auth/postmessage-bridge", "http://127.0.0.1");
    const returnTo = requestUrl.searchParams.get("returnTo") ?? getDefaultReturnTo();
        const redirectOnSuccess = requestUrl.searchParams.get("redirect") !== "0";
        const closeOnSuccess = requestUrl.searchParams.get("close") === "1";
        const allowedOriginsJson = JSON.stringify(config.authPostMessageAllowedOrigins);
        const returnToJson = JSON.stringify(returnTo);

        return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ThisIsMyDepartment.AI Embedded Login Bridge</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1522; color: #eef3ff; margin: 0; }
        main { max-width: 720px; margin: 48px auto; padding: 28px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); }
        h1 { margin-top: 0; font-size: 28px; }
        p, li { line-height: 1.6; }
        code, pre { background: rgba(255,255,255,0.08); padding: 2px 6px; }
        pre { padding: 12px; overflow: auto; }
        .status { margin-top: 20px; padding: 12px 14px; border-left: 4px solid #7aa2ff; background: rgba(122,162,255,0.12); }
        .warn { border-left-color: #ffb366; background: rgba(255,179,102,0.12); }
    </style>
</head>
<body>
    <main>
        <h1>Embedded Login Bridge</h1>
        <p>This page waits for a trusted <code>postMessage</code> from the embedding parent window or popup opener, forwards the payload to <code>/auth/handoff</code>, and creates the normal ThisIsMyDepartment.AI session cookie.</p>
        <p>Accepted message format:</p>
        <pre>{
    type: "thisismydepartment-auth-handoff",
    payload: {
        token?: "...",
        sharedSecret?: "...",
        identity?: {
            externalProvider: "campus-sso",
            externalId: "2026001234",
            displayName: "Jane Doe"
        }
    }
}</pre>
        <div id="status" class="status">Waiting for auth handoff message...</div>
        <div id="origins" class="status${config.authPostMessageAllowedOrigins.length === 0 ? " warn" : ""}">
            Allowed origins: ${config.authPostMessageAllowedOrigins.length > 0
                        ? escapeHtml(config.authPostMessageAllowedOrigins.join(", "))
                        : "No origins configured. Set AUTH_POSTMESSAGE_ALLOWED_ORIGINS to enable this bridge."}
        </div>
    </main>
    <script>
        (function () {
            const allowedOrigins = ${allowedOriginsJson};
            const returnTo = ${returnToJson};
            const redirectOnSuccess = ${redirectOnSuccess ? "true" : "false"};
            const closeOnSuccess = ${closeOnSuccess ? "true" : "false"};
            const status = document.getElementById("status");
            const bridgeType = "thisismydepartment-auth-handoff";
            const readyType = "thisismydepartment-auth-ready";
            const resultType = "thisismydepartment-auth-result";

            const setStatus = function (message, isError) {
                status.textContent = message;
                status.className = isError ? "status warn" : "status";
            };

            const isAllowedOrigin = function (origin) {
                if (!Array.isArray(allowedOrigins) || allowedOrigins.length === 0) {
                    return false;
                }
                return allowedOrigins.indexOf("*") >= 0 || allowedOrigins.indexOf(origin) >= 0;
            };

            const postBack = function (target, origin, payload) {
                if (!target || typeof target.postMessage !== "function") {
                    return;
                }
                target.postMessage(payload, origin);
            };

            const signalReady = function () {
                const payload = { type: readyType, origin: window.location.origin, returnTo: returnTo };
                if (window.parent && window.parent !== window) {
                    postBack(window.parent, "*", payload);
                }
                if (window.opener && window.opener !== window) {
                    postBack(window.opener, "*", payload);
                }
            };

            window.addEventListener("message", async function (event) {
                if (!isAllowedOrigin(event.origin)) {
                    setStatus("Rejected auth handoff from disallowed origin: " + event.origin, true);
                    return;
                }

                const message = event.data && typeof event.data === "object" ? event.data : null;
                if (!message) {
                    setStatus("Rejected auth handoff because message payload is invalid.", true);
                    return;
                }

                const payload = message.type === bridgeType ? message.payload : message;
                if (!payload || typeof payload !== "object") {
                    setStatus("Rejected auth handoff because the message payload is empty.", true);
                    return;
                }

                setStatus("Verifying auth handoff...");
                try {
                    const response = await fetch("/auth/handoff", {
                        method: "POST",
                        credentials: "include",
                        headers: {
                            "Content-Type": "application/json",
                            "Accept": "application/json"
                        },
                        body: JSON.stringify(payload)
                    });
                    const result = await response.json().catch(function () { return { error: "Invalid backend response" }; });

                    if (!response.ok) {
                        const messageText = result && result.error ? result.error : "Handoff verification failed";
                        setStatus(messageText, true);
                        postBack(event.source, event.origin, { type: resultType, ok: false, error: messageText });
                        return;
                    }

                    setStatus("Login bridge completed. Session established.");
                    postBack(event.source, event.origin, { type: resultType, ok: true, bootstrap: result, returnTo: returnTo });

                    if (closeOnSuccess && window.opener && window.opener !== window) {
                        window.close();
                        return;
                    }

                    if (redirectOnSuccess && returnTo) {
                        window.location.assign(returnTo);
                    }
                } catch (error) {
                    const messageText = error && error.message ? error.message : "Bridge request failed";
                    setStatus(messageText, true);
                    postBack(event.source, event.origin, { type: resultType, ok: false, error: messageText });
                }
            });

            signalReady();
        }());
    </script>
</body>
</html>`;
};

const renderLoginPage = (request: IncomingMessage): string => {
    const config = getServerConfig();
    const requestUrl = new URL(request.url ?? "/auth/login", "http://127.0.0.1");
    const returnTo = requestUrl.searchParams.get("returnTo") ?? getDefaultReturnTo();
    const authModes = getConfiguredAuthModes();
    const authModesHtml = authModes.length > 0
        ? `<ul>${authModes.map(mode => `<li>${mode}</li>`).join("")}</ul>`
        : "<p>No external auth adapters are configured yet.</p>";

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ThisIsMyDepartment.AI Login</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f0e8; color: #1f1a14; margin: 0; }
    main { max-width: 560px; margin: 48px auto; padding: 32px; background: rgba(255,255,255,0.92); border: 1px solid rgba(31,26,20,0.12); box-shadow: 0 20px 60px rgba(31,26,20,0.12); }
    h1 { margin-top: 0; font-size: 28px; }
    p { line-height: 1.5; }
    form { display: grid; gap: 12px; margin-top: 24px; }
    label { display: grid; gap: 6px; font-size: 14px; }
    input { padding: 10px 12px; font-size: 14px; border: 1px solid rgba(31,26,20,0.2); }
    button { margin-top: 8px; padding: 12px 16px; font-size: 15px; background: #1f1a14; color: #fff; border: 0; cursor: pointer; }
    code { background: rgba(31,26,20,0.08); padding: 2px 6px; }
        .modes { margin-top: 20px; padding: 12px 16px; background: rgba(31,26,20,0.04); border-left: 4px solid rgba(31,26,20,0.2); }
        .actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
        .link-button { display: inline-block; margin-top: 8px; padding: 12px 16px; background: #6e5b47; color: #fff; text-decoration: none; }
  </style>
</head>
<body>
  <main>
    <h1>Sign In</h1>
        <p>This fallback page exists for local hosting and adapter testing. In production, your upstream site should POST a verified handoff payload to <code>/auth/handoff</code>, send authenticated headers to <code>/auth/proxy-login</code>, or use <code>/auth/postmessage-bridge</code> for iframe and popup flows.</p>
        <div class="modes">
            <strong>Configured auth modes</strong>
            ${authModesHtml}
        </div>
        <div class="actions">
            <a class="link-button" href="/auth/proxy-login?returnTo=${encodeURIComponent(returnTo)}">Try reverse-proxy login</a>
            <a class="link-button" href="/auth/postmessage-bridge?returnTo=${encodeURIComponent(returnTo)}">Open postMessage bridge</a>
        </div>
    <form method="post" action="/auth/handoff">
      <input type="hidden" name="returnTo" value="${returnTo.replace(/"/g, "&quot;")}" />
      <label>Provider<input name="externalProvider" value="local-dev" required /></label>
      <label>External ID<input name="externalId" value="demo-user" required /></label>
      <label>Display Name<input name="displayName" value="Demo User" required /></label>
      <label>Email<input name="email" value="demo@example.com" /></label>
    <label>Organization<input name="organization" value="${escapeHtml(config.defaultOrganizationName)}" /></label>
    <label>Department<input name="department" value="${escapeHtml(config.defaultDepartmentName)}" /></label>
      <label>Roles (comma separated)<input name="roles" value="member" /></label>
      <button type="submit">Continue To The Department</button>
    </form>
  </main>
</body>
</html>`;
};

export const handleHandoffRoute = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
        const payload = await parseHandoffRequest(request);
        const verifiedIdentity = verifyHandoffPayload(request, payload);
        if (!verifiedIdentity) {
            sendJson(request, response, 401, { error: "Handoff verification failed" });
            return;
        }

        const sessionContext = createSessionForVerifiedIdentity(verifiedIdentity, getClientType(request));
        setSessionCookie(response, sessionContext.session.sessionId);

        const acceptsHtml = (request.headers.accept ?? "").includes("text/html") || (request.headers["content-type"] ?? "").includes("application/x-www-form-urlencoded");
        if (acceptsHtml) {
            redirect(request, response, payload.returnTo ?? getDefaultReturnTo());
            return;
        }

        sendJson(request, response, 200, buildBootstrapResponseForSession(sessionContext));
    } catch (_error) {
        sendJson(request, response, 400, { error: "Invalid handoff payload" });
    }
};

export const handleLogoutRoute = (request: IncomingMessage, response: ServerResponse): void => {
    const sessionId = getSessionIdFromRequest(request);
    destroySession(sessionId);
    clearSessionCookie(response);
    sendJson(request, response, 200, { ok: true });
};

export const handleAuthStatusRoute = (request: IncomingMessage, response: ServerResponse): void => {
    const sessionContext = getSessionContext(getSessionIdFromRequest(request));
    sendJson(request, response, 200, buildBootstrapResponseForSession(sessionContext));
};

export const handleLoginPageRoute = (request: IncomingMessage, response: ServerResponse): void => {
    sendHtml(request, response, 200, renderLoginPage(request));
};

export const handleProxyLoginRoute = (request: IncomingMessage, response: ServerResponse): void => {
    const requestUrl = new URL(request.url ?? "/auth/proxy-login", "http://127.0.0.1");
    const returnTo = requestUrl.searchParams.get("returnTo") ?? getDefaultReturnTo();
    const verifiedIdentity = verifyProxyHeaderIdentity(request);
    if (!verifiedIdentity) {
        sendJson(request, response, 401, {
            error: "Reverse-proxy header verification failed"
        });
        return;
    }

    const sessionContext = createSessionForVerifiedIdentity(verifiedIdentity, getClientType(request));
    setSessionCookie(response, sessionContext.session.sessionId);

    const acceptsHtml = (request.headers.accept ?? "").includes("text/html");
    if (acceptsHtml) {
        redirect(request, response, returnTo);
        return;
    }

    sendJson(request, response, 200, buildBootstrapResponseForSession(sessionContext));
};

export const handlePostMessageBridgeRoute = (request: IncomingMessage, response: ServerResponse): void => {
    sendHtml(request, response, 200, renderPostMessageBridgePage(request));
};