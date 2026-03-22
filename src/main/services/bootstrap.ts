import type { BootstrapState } from "../types/currentUser";
import { getBackendEndpointCandidates } from "../runtimeConfig";

const now = () => new Date().toISOString();

const createFallbackBootstrapState = (): BootstrapState => ({
    authenticated: true,
    user: {
        userId: "local-demo-user",
        displayName: "Demo User",
        externalId: "local-demo-user",
        email: "demo@example.com",
        organization: "ThisIsMyDepartment.AI",
        department: "Demo Department",
        roles: ["member"]
    },
    profile: {
        avatar: {
            spriteIndex: 0,
            updatedAt: now()
        },
        characterSystemPrompt: "",
        preferences: {},
        updatedAt: now()
    },
    session: {
        sessionId: "local-demo-session",
        userId: "local-demo-user",
        clientType: "web",
        startedAt: now()
    },
    agents: [],
    room: {
        roomId: "demo-room",
        displayName: "Demo Department Room"
    }
});

const getBootstrapCandidates = (): string[] => {
    return getBackendEndpointCandidates("/api/bootstrap");
};

const resolveLoginUrl = (endpoint: string, bootstrapState: BootstrapState): string => {
    if (bootstrapState.loginUrl) {
        return new URL(bootstrapState.loginUrl, endpoint).toString();
    }
    return new URL("/auth/login", endpoint).toString();
};

export const loadBootstrapState = async (): Promise<BootstrapState> => {
    const candidates = getBootstrapCandidates();

    for (const endpoint of candidates) {
        try {
            const response = await fetch(endpoint, {
                method: "GET",
                credentials: "include",
                headers: {
                    "Accept": "application/json"
                }
            });
            if (!response.ok) {
                continue;
            }
            const bootstrapState = await response.json() as BootstrapState;
            if (!bootstrapState.authenticated) {
                const loginUrl = new URL(resolveLoginUrl(endpoint, bootstrapState));
                loginUrl.searchParams.set("returnTo", window.location.href);
                window.location.assign(loginUrl.toString());
            }
            return bootstrapState;
        } catch (error) {
            console.warn(`Bootstrap request failed for ${endpoint}`, error);
        }
    }

    return createFallbackBootstrapState();
};