import type { IncomingMessage, ServerResponse } from "http";

const applyCors = (request: IncomingMessage, response: ServerResponse): void => {
    const origin = request.headers.origin;
    if (origin) {
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Access-Control-Allow-Credentials", "true");
        response.setHeader("Vary", "Origin");
        return;
    }

    response.setHeader("Access-Control-Allow-Origin", "*");
};

export const applyStandardHeaders = (request: IncomingMessage, response: ServerResponse): void => {
    applyCors(request, response);
    response.setHeader("Cache-Control", "no-store");
};

export const sendJson = (request: IncomingMessage, response: ServerResponse, statusCode: number, payload: unknown): void => {
    response.statusCode = statusCode;
    applyStandardHeaders(request, response);
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify(payload));
};

export const sendHtml = (request: IncomingMessage, response: ServerResponse, statusCode: number, html: string): void => {
    response.statusCode = statusCode;
    applyStandardHeaders(request, response);
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(html);
};

export const redirect = (request: IncomingMessage, response: ServerResponse, location: string): void => {
    response.statusCode = 302;
    applyStandardHeaders(request, response);
    response.setHeader("Location", location);
    response.end();
};

export const handleOptions = (request: IncomingMessage, response: ServerResponse): void => {
    response.statusCode = 204;
    applyStandardHeaders(request, response);
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-ThisIsMyDepartment-Handoff-Secret");
    response.end();
};