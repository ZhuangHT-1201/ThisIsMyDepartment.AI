import type { IncomingMessage, ServerResponse } from "http";
import { getSessionIdFromRequest } from "../auth/session";
import { sendJson } from "../http/response";
import { buildBootstrapResponseForSession, getSessionContext } from "../storage/memory/bootstrapStore";

export const handleBootstrapRoute = (request: IncomingMessage, response: ServerResponse): void => {
    const sessionContext = getSessionContext(getSessionIdFromRequest(request));
    sendJson(request, response, 200, buildBootstrapResponseForSession(sessionContext));
};