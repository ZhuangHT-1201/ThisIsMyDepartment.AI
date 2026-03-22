import type { IncomingMessage } from "http";

const collectBody = async (request: IncomingMessage): Promise<string> => {
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
        request.on("data", chunk => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        request.on("end", () => {
            resolve(Buffer.concat(chunks).toString("utf8"));
        });
        request.on("error", reject);
    });
};

export const readRequestBody = async (request: IncomingMessage): Promise<string> => {
    return collectBody(request);
};

export const parseJsonBody = async <T>(request: IncomingMessage): Promise<T> => {
    const rawBody = await collectBody(request);
    if (!rawBody.trim()) {
        return {} as T;
    }
    return JSON.parse(rawBody) as T;
};

export const parseFormBody = async (request: IncomingMessage): Promise<Record<string, string>> => {
    const rawBody = await collectBody(request);
    const params = new URLSearchParams(rawBody);
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
        result[key] = value;
    });
    return result;
};