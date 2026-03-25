import { getBackendEndpointCandidates } from "../runtimeConfig";

export interface AvatarDirectoryUserSummary {
    userId: string;
    displayName: string;
    organization?: string;
    department?: string;
    roles: string[];
    isOnline?: boolean;
    avatar?: {
        spriteIndex: number;
        updatedAt: string;
    };
    hasCharacterSystemPrompt: boolean;
    updatedAt?: string;
}

interface ListUsersResponse {
    users?: AvatarDirectoryUserSummary[];
}

interface SpawnAvatarResponse {
    agent?: {
        agentId: string;
        displayName: string;
        spriteIndex: number;
        position: { x: number; y: number };
    };
}

const getUserDirectoryCandidates = (): string[] => {
    return getBackendEndpointCandidates("/api/users");
};

const getSpawnAvatarCandidates = (): string[] => {
    return getBackendEndpointCandidates("/api/avatar-agents/spawn");
};

const appendCacheBust = (endpoint: string): string => {
    const url = new URL(endpoint, window.location.origin);
    url.searchParams.set("_ts", String(Date.now()));
    return url.toString();
};

export const fetchAvatarDirectoryUsers = async (): Promise<AvatarDirectoryUserSummary[]> => {
    const candidates = getUserDirectoryCandidates();
    let lastError: Error | null = null;

    for (const endpoint of candidates) {
        try {
            const response = await fetch(appendCacheBust(endpoint), {
                method: "GET",
                cache: "no-store",
                credentials: "include",
                headers: {
                    "Accept": "application/json"
                }
            });

            if (!response.ok) {
                lastError = new Error(`Avatar directory request failed with ${response.status} for ${endpoint}`);
                continue;
            }

            const result = await response.json() as ListUsersResponse;
            return Array.isArray(result.users) ? result.users : [];
        } catch (error) {
            console.warn(`Avatar directory request failed for ${endpoint}`, error);
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }

    throw lastError ?? new Error("Avatar directory request failed.");
};

export const spawnAvatarAgent = async (args: {
    targetUserId: string;
    position: { x: number; y: number };
}): Promise<SpawnAvatarResponse["agent"] | null> => {
    const candidates = getSpawnAvatarCandidates();

    for (const endpoint of candidates) {
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(args)
            });

            if (!response.ok) {
                continue;
            }

            const result = await response.json() as SpawnAvatarResponse;
            return result.agent ?? null;
        } catch (error) {
            console.warn(`Avatar spawn request failed for ${endpoint}`, error);
        }
    }

    return null;
};