import type { JitsiConferenceOptions } from "../typings/Jitsi/JitsiConnection";

interface FrontendRuntimeConfig {
    backendBaseUrl?: unknown;
    socketBaseUrl?: unknown;
    jitsiDomain?: unknown;
    jitsiMuc?: unknown;
    jitsiServiceUrl?: unknown;
    jitsiClientNode?: unknown;
}

const readRuntimeConfig = (): FrontendRuntimeConfig => {
    return ((window as any).THISISMYDEPARTMENT_CONFIG ?? {}) as FrontendRuntimeConfig;
};

const readStringConfig = (key: keyof FrontendRuntimeConfig): string | undefined => {
    const value = readRuntimeConfig()[key];
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith("__TIMD_")) {
        return undefined;
    }
    return trimmed;
};

const ensureTrailingSlash = (value: string): string => {
    return value.endsWith("/") ? value : `${value}/`;
};

const stripTrailingSlash = (value: string): string => {
    return value.endsWith("/") ? value.slice(0, -1) : value;
};

const getDefaultProtocol = (): string => {
    return window.location.protocol === "https:" ? "https:" : "http:";
};

const getDefaultHostname = (): string => {
    return window.location.hostname || "127.0.0.1";
};

const isLocalDevelopmentHost = (): boolean => {
    const hostname = getDefaultHostname().toLowerCase();
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "0.0.0.0";
};

export const getRealtimeSocketBaseUrl = (): string => {
    const configured = readStringConfig("socketBaseUrl");
    if (configured) {
        return ensureTrailingSlash(configured);
    }

    const currentOrigin = stripTrailingSlash(window.location.origin);
    if (window.location.port && window.location.port !== "8000") {
        return ensureTrailingSlash(currentOrigin);
    }

    return ensureTrailingSlash(`${getDefaultProtocol()}//${getDefaultHostname()}:8787`);
};

export const getBackendBaseCandidates = (): string[] => {
    const configured = readStringConfig("backendBaseUrl");
    const sameOrigin = stripTrailingSlash(window.location.origin);
    const localBackend = "http://127.0.0.1:8787";
    const candidates: string[] = [];

    if (configured) {
        candidates.push(stripTrailingSlash(configured));
    }

    if (window.location.port === "8000") {
        candidates.push(localBackend, sameOrigin);
    } else {
        candidates.push(sameOrigin, localBackend);
    }

    return Array.from(new Set(candidates));
};

export const getBackendEndpointCandidates = (path: string): string[] => {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return getBackendBaseCandidates().map(base => `${base}${normalizedPath}`);
};

export const shouldEnableJitsi = (): boolean => {
    const hasExplicitConfig = Boolean(
        readStringConfig("jitsiDomain")
        || readStringConfig("jitsiMuc")
        || readStringConfig("jitsiServiceUrl")
        || readStringConfig("jitsiClientNode")
    );

    if (hasExplicitConfig) {
        return true;
    }

    return !isLocalDevelopmentHost();
};

export const getJitsiConnectionOptions = (): JitsiConferenceOptions => {
    const domain = readStringConfig("jitsiDomain") ?? getDefaultHostname();
    const muc = readStringConfig("jitsiMuc") ?? `conference.${domain}`;
    const serviceUrl = readStringConfig("jitsiServiceUrl") ?? `${getDefaultProtocol()}//${domain}/http-bind`;
    const clientNode = readStringConfig("jitsiClientNode") ?? `${getDefaultProtocol()}//${domain}/jitsimeet`;

    return {
        hosts: {
            domain,
            muc
        },
        serviceUrl,
        clientNode
    };
};