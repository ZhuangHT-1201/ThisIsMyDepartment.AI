import type { IncomingMessage } from "http";
import { createHmac, timingSafeEqual } from "crypto";
import type { VerifiedIdentity } from "../../../shared/types";
import { getServerConfig } from "../config";

interface HandoffPayload {
    externalProvider?: string;
    externalId?: string;
    displayName?: string;
    email?: string;
    organization?: string;
    department?: string;
    roles?: string[] | string;
    sharedSecret?: string;
    token?: string;
    identity?: Partial<VerifiedIdentity>;
}

interface HandoffVerifier {
    name: string;
    verify: (request: IncomingMessage, payload: HandoffPayload) => VerifiedIdentity | null;
}

interface ProxyHeaderVerifier {
    name: string;
    verify: (request: IncomingMessage) => VerifiedIdentity | null;
}

type JwtClaims = Record<string, unknown>;

const normalizeRoles = (roles: string[] | string | undefined): string[] => {
    if (Array.isArray(roles)) {
        return roles.filter(role => typeof role === "string" && role.trim().length > 0);
    }
    if (typeof roles === "string") {
        return roles.split(",").map(role => role.trim()).filter(Boolean);
    }
    return [];
};

const normalizeIdentity = (payload: HandoffPayload): VerifiedIdentity | null => {
    const source = payload.identity ?? payload;
    const externalProvider = source.externalProvider?.trim() ?? payload.externalProvider?.trim();
    const externalId = source.externalId?.trim() ?? payload.externalId?.trim();
    const displayName = source.displayName?.trim() ?? payload.displayName?.trim();

    if (!externalProvider || !externalId || !displayName) {
        return null;
    }

    return {
        externalProvider,
        externalId,
        displayName,
        email: source.email?.trim() ?? payload.email?.trim(),
        organization: source.organization?.trim() ?? payload.organization?.trim(),
        department: source.department?.trim() ?? payload.department?.trim(),
        roles: normalizeRoles(source.roles ?? payload.roles)
    };
};

const normalizeRolesClaim = (value: unknown): string[] => {
    if (Array.isArray(value)) {
        return value.filter(item => typeof item === "string" && item.trim().length > 0);
    }
    if (typeof value === "string") {
        return value.split(",").map(item => item.trim()).filter(Boolean);
    }
    return [];
};

const readHeaderValue = (request: IncomingMessage, headerName: string | undefined): string | undefined => {
    if (!headerName) {
        return undefined;
    }
    const value = request.headers[headerName.toLowerCase()];
    if (Array.isArray(value)) {
        return value[0];
    }
    return typeof value === "string" ? value : undefined;
};

const decodeBase64Url = (value: string): string => {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    return Buffer.from(normalized + padding, "base64").toString("utf8");
};

const getJwtTokenFromRequest = (request: IncomingMessage, payload: HandoffPayload): string | null => {
    if (typeof payload.token === "string" && payload.token.trim().length > 0) {
        return payload.token.trim();
    }

    const authorization = readHeaderValue(request, "authorization");
    if (!authorization) {
        return null;
    }

    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() ?? null;
};

const parseJwtClaims = (request: IncomingMessage, payload: HandoffPayload): JwtClaims | null => {
    const config = getServerConfig();
    const token = getJwtTokenFromRequest(request, payload);
    if (!token || !config.authJwtSharedSecret) {
        return null;
    }

    const parts = token.split(".");
    if (parts.length !== 3) {
        return null;
    }

    try {
        const header = JSON.parse(decodeBase64Url(parts[0])) as { alg?: string; typ?: string };
        if (header.alg !== "HS256") {
            return null;
        }

        const expected = createHmac("sha256", config.authJwtSharedSecret).update(`${parts[0]}.${parts[1]}`).digest();
        const provided = Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
        if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
            return null;
        }

        const claims = JSON.parse(decodeBase64Url(parts[1])) as JwtClaims;
        const nowSeconds = Math.floor(Date.now() / 1000);

        const exp = typeof claims.exp === "number" ? claims.exp : undefined;
        if (typeof exp === "number" && exp < nowSeconds) {
            return null;
        }

        const nbf = typeof claims.nbf === "number" ? claims.nbf : undefined;
        if (typeof nbf === "number" && nbf > nowSeconds) {
            return null;
        }

        if (config.authJwtIssuer && claims.iss !== config.authJwtIssuer) {
            return null;
        }

        if (config.authJwtAudience) {
            const audience = claims.aud;
            const validAudience = audience === config.authJwtAudience
                || (Array.isArray(audience) && audience.includes(config.authJwtAudience));
            if (!validAudience) {
                return null;
            }
        }

        return claims;
    } catch (_error) {
        return null;
    }
};

const normalizeIdentityFromClaims = (claims: JwtClaims): VerifiedIdentity | null => {
    const identityClaim = typeof claims.identity === "object" && claims.identity ? claims.identity as Record<string, unknown> : null;
    const externalProvider = identityClaim?.externalProvider
        ?? identityClaim?.external_provider
        ?? claims.externalProvider
        ?? claims.external_provider
        ?? claims.provider;
    const externalId = identityClaim?.externalId
        ?? identityClaim?.external_id
        ?? claims.externalId
        ?? claims.external_id
        ?? claims.sub
        ?? claims.user_id
        ?? claims.username;
    const displayName = identityClaim?.displayName
        ?? identityClaim?.display_name
        ?? claims.displayName
        ?? claims.display_name
        ?? claims.name
        ?? claims.preferred_username;

    if (typeof externalProvider !== "string" || typeof externalId !== "string" || typeof displayName !== "string") {
        return null;
    }

    const email = identityClaim?.email ?? claims.email;
    const organization = identityClaim?.organization ?? identityClaim?.org ?? claims.organization ?? claims.org;
    const department = identityClaim?.department ?? claims.department;
    const roles = identityClaim?.roles ?? claims.roles ?? claims.role;

    return {
        externalProvider: externalProvider.trim(),
        externalId: externalId.trim(),
        displayName: displayName.trim(),
        email: typeof email === "string" ? email.trim() : undefined,
        organization: typeof organization === "string" ? organization.trim() : undefined,
        department: typeof department === "string" ? department.trim() : undefined,
        roles: normalizeRolesClaim(roles)
    };
};

const createSharedSecretVerifier = (): HandoffVerifier => ({
    name: "shared-secret",
    verify: (request, payload) => {
        const config = getServerConfig();
        if (!config.authHandoffSharedSecret) {
            return null;
        }

        const providedSecret = request.headers["x-thisismydepartment-handoff-secret"] ?? payload.sharedSecret;
        if (typeof providedSecret !== "string" || providedSecret !== config.authHandoffSharedSecret) {
            return null;
        }

        return normalizeIdentity(payload);
    }
});

const createJwtVerifier = (): HandoffVerifier => ({
    name: "jwt",
    verify: (request, payload) => {
        const claims = parseJwtClaims(request, payload);
        return claims ? normalizeIdentityFromClaims(claims) : null;
    }
});

const createInsecureDevVerifier = (): HandoffVerifier => ({
    name: "insecure-dev",
    verify: (_request, payload) => {
        const config = getServerConfig();
        if (!config.allowInsecureDevHandoff) {
            return null;
        }
        return normalizeIdentity(payload);
    }
});

const createProxyHeaderVerifier = (): ProxyHeaderVerifier => ({
    name: "reverse-proxy-headers",
    verify: (request) => {
        const config = getServerConfig();
        if (!config.authProxyExternalIdHeader || !config.authProxyDisplayNameHeader) {
            return null;
        }

        const requiredHeader = config.authProxyAuthenticatedHeader;
        const requiredValue = config.authProxyAuthenticatedValue;
        if (requiredHeader && requiredValue) {
            const headerValue = readHeaderValue(request, requiredHeader);
            if (!headerValue || headerValue !== requiredValue) {
                return null;
            }
        }

        const externalId = readHeaderValue(request, config.authProxyExternalIdHeader)?.trim();
        const displayName = readHeaderValue(request, config.authProxyDisplayNameHeader)?.trim();
        if (!externalId || !displayName) {
            return null;
        }

        return {
            externalProvider: config.authProxyProvider,
            externalId,
            displayName,
            email: readHeaderValue(request, config.authProxyEmailHeader)?.trim(),
            organization: readHeaderValue(request, config.authProxyOrganizationHeader)?.trim(),
            department: readHeaderValue(request, config.authProxyDepartmentHeader)?.trim(),
            roles: normalizeRoles(readHeaderValue(request, config.authProxyRolesHeader))
        };
    }
});

const verifiers: HandoffVerifier[] = [
    createSharedSecretVerifier(),
    createJwtVerifier(),
    createInsecureDevVerifier()
];

const proxyHeaderVerifier = createProxyHeaderVerifier();

export const getConfiguredAuthModes = (): string[] => {
    const config = getServerConfig();
    const modes: string[] = [];
    if (config.authHandoffSharedSecret) {
        modes.push("signed POST handoff (shared secret)");
    }
    if (config.authJwtSharedSecret) {
        modes.push("JWT handoff");
    }
    if (config.authProxyExternalIdHeader && config.authProxyDisplayNameHeader) {
        modes.push("reverse-proxy headers");
    }
    if (config.authPostMessageAllowedOrigins.length > 0) {
        modes.push("iframe/popup postMessage bridge");
    }
    if (config.allowInsecureDevHandoff) {
        modes.push("insecure dev handoff");
    }
    return modes;
};

export const verifyHandoffPayload = (request: IncomingMessage, payload: HandoffPayload): VerifiedIdentity | null => {
    for (const verifier of verifiers) {
        const verifiedIdentity = verifier.verify(request, payload);
        if (verifiedIdentity) {
            return verifiedIdentity;
        }
    }
    return null;
};

export const verifyProxyHeaderIdentity = (request: IncomingMessage): VerifiedIdentity | null => {
    return proxyHeaderVerifier.verify(request);
};