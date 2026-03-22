import type { IncomingMessage, ServerResponse } from "http";
import { getServerConfig } from "../config";

const SESSION_COOKIE_NAME = getServerConfig().sessionCookieName;

export const parseCookieHeader = (value?: string): Record<string, string> => {
    if (!value) {
        return {};
    }

    return value.split(";").reduce<Record<string, string>>((cookies, part) => {
        const separatorIndex = part.indexOf("=");
        if (separatorIndex <= 0) {
            return cookies;
        }
        const key = part.slice(0, separatorIndex).trim();
        const cookieValue = part.slice(separatorIndex + 1).trim();
        cookies[key] = decodeURIComponent(cookieValue);
        return cookies;
    }, {});
};

export const getSessionIdFromRequest = (request: IncomingMessage): string | null => {
    const cookies = parseCookieHeader(request.headers.cookie);
    return cookies[SESSION_COOKIE_NAME] ?? null;
};

export const getSessionIdFromCookieHeader = (cookieHeader?: string): string | null => {
    const cookies = parseCookieHeader(cookieHeader);
    return cookies[SESSION_COOKIE_NAME] ?? null;
};

export const setSessionCookie = (response: ServerResponse, sessionId: string): void => {
    response.setHeader("Set-Cookie", `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax`);
};

export const clearSessionCookie = (response: ServerResponse): void => {
    response.setHeader("Set-Cookie", `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
};