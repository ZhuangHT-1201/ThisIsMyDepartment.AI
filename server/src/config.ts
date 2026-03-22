export interface ServerConfig {
    host: string;
    port: number;
    frontendBaseUrl?: string;
    sessionCookieName: string;
    sessionTtlSeconds: number;
    defaultOrganizationName: string;
    defaultDepartmentName: string;
    defaultRoomId: string;
    defaultRoomDisplayName: string;
    authHandoffSharedSecret?: string;
    authJwtSharedSecret?: string;
    authJwtIssuer?: string;
    authJwtAudience?: string;
    allowInsecureDevHandoff: boolean;
    authProxyProvider: string;
    authProxyExternalIdHeader?: string;
    authProxyDisplayNameHeader?: string;
    authProxyEmailHeader?: string;
    authProxyOrganizationHeader?: string;
    authProxyDepartmentHeader?: string;
    authProxyRolesHeader?: string;
    authProxyAuthenticatedHeader?: string;
    authProxyAuthenticatedValue?: string;
    authPostMessageAllowedOrigins: string[];
}

export const getServerConfig = (): ServerConfig => {
    const portValue = process.env.PORT;
    const parsedPort = portValue ? Number(portValue) : NaN;
    const ttlValue = process.env.AUTH_SESSION_TTL_SECONDS;
    const parsedTtl = ttlValue ? Number(ttlValue) : NaN;

    return {
        host: process.env.HOST ?? "127.0.0.1",
        port: Number.isFinite(parsedPort) ? parsedPort : 8787,
        frontendBaseUrl: process.env.TIMD_FRONTEND_BASE_URL || undefined,
        sessionCookieName: process.env.AUTH_SESSION_COOKIE_NAME ?? "timd_session",
        sessionTtlSeconds: Number.isFinite(parsedTtl) ? parsedTtl : 8 * 60 * 60,
        defaultOrganizationName: process.env.TIMD_DEFAULT_ORGANIZATION ?? "ThisIsMyDepartment.AI",
        defaultDepartmentName: process.env.TIMD_DEFAULT_DEPARTMENT ?? "Department",
        defaultRoomId: process.env.TIMD_DEFAULT_ROOM_ID ?? "department-room",
        defaultRoomDisplayName: process.env.TIMD_DEFAULT_ROOM_DISPLAY_NAME ?? "ThisIsMyDepartment.AI Room",
        authHandoffSharedSecret: process.env.AUTH_HANDOFF_SHARED_SECRET || undefined,
        authJwtSharedSecret: process.env.AUTH_JWT_SHARED_SECRET || undefined,
        authJwtIssuer: process.env.AUTH_JWT_ISSUER || undefined,
        authJwtAudience: process.env.AUTH_JWT_AUDIENCE || undefined,
        allowInsecureDevHandoff: process.env.AUTH_ALLOW_INSECURE_DEV_HANDOFF !== "false",
        authProxyProvider: process.env.AUTH_PROXY_PROVIDER ?? "reverse-proxy",
        authProxyExternalIdHeader: process.env.AUTH_PROXY_EXTERNAL_ID_HEADER || undefined,
        authProxyDisplayNameHeader: process.env.AUTH_PROXY_DISPLAY_NAME_HEADER || undefined,
        authProxyEmailHeader: process.env.AUTH_PROXY_EMAIL_HEADER || undefined,
        authProxyOrganizationHeader: process.env.AUTH_PROXY_ORGANIZATION_HEADER || undefined,
        authProxyDepartmentHeader: process.env.AUTH_PROXY_DEPARTMENT_HEADER || undefined,
        authProxyRolesHeader: process.env.AUTH_PROXY_ROLES_HEADER || undefined,
        authProxyAuthenticatedHeader: process.env.AUTH_PROXY_AUTHENTICATED_HEADER || undefined,
        authProxyAuthenticatedValue: process.env.AUTH_PROXY_AUTHENTICATED_VALUE || undefined,
        authPostMessageAllowedOrigins: (process.env.AUTH_POSTMESSAGE_ALLOWED_ORIGINS ?? "")
            .split(",")
            .map(origin => origin.trim())
            .filter(Boolean)
    };
};