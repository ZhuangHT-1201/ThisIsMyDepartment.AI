export type ClientType = "web" | "electron";

export interface AppSession {
    sessionId: string;
    userId: string;
    clientType: ClientType;
    startedAt: string;
    expiresAt?: string;
}