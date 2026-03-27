import { getBackendEndpointCandidates } from "../runtimeConfig";

export interface EditableEnvironmentAvatar {
    agentId: string;
    displayName: string;
    spriteIndex: number;
    caption?: string;
    defaultSystemPrompt?: string;
    position: { x: number; y: number };
    walkArea?: { x: number; y: number; width: number; height: number };
    characterRole?: "teacher" | "student" | "staff" | "custom";
    spawnByDefault?: boolean;
    provider: "mock" | "openai" | "openrouter" | "anthropic" | "ollama" | "azure-openai";
    model: string;
    updatedAt?: string;
}

interface ListEnvironmentAvatarsResponse {
    agents?: EditableEnvironmentAvatar[];
}

interface UpdateEnvironmentAvatarResponse {
    agent?: EditableEnvironmentAvatar;
}

interface CreateEnvironmentAvatarResponse {
    agent?: EditableEnvironmentAvatar;
}

const ADMIN_REQUEST_TIMEOUT_MS = 8000;

const getEnvironmentAvatarAdminCandidates = (): string[] => {
    return getBackendEndpointCandidates("/api/admin/environment-avatars");
};

const fetchWithTimeout = async (input: string, init: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), ADMIN_REQUEST_TIMEOUT_MS);
    try {
        return await fetch(input, {
            ...init,
            signal: controller.signal
        });
    } finally {
        window.clearTimeout(timeoutId);
    }
};

export const fetchEditableEnvironmentAvatars = async (): Promise<EditableEnvironmentAvatar[]> => {
    const candidates = getEnvironmentAvatarAdminCandidates();
    let lastError: Error | null = null;

    for (const endpoint of candidates) {
        try {
            const response = await fetchWithTimeout(endpoint, {
                method: "GET",
                credentials: "include",
                headers: {
                    "Accept": "application/json"
                }
            });

            if (!response.ok) {
                lastError = new Error(`Environment avatar list request failed with ${response.status}`);
                continue;
            }

            const result = await response.json() as ListEnvironmentAvatarsResponse;
            return Array.isArray(result.agents) ? result.agents : [];
        } catch (error) {
            lastError = error instanceof DOMException && error.name === "AbortError"
                ? new Error("Environment avatar request timed out. Check whether the backend admin API is running.")
                : error instanceof Error
                    ? error
                    : new Error(String(error));
        }
    }

    throw lastError ?? new Error("Environment avatar list request failed.");
};

export const saveEditableEnvironmentAvatar = async (avatar: EditableEnvironmentAvatar): Promise<EditableEnvironmentAvatar | null> => {
    const candidates = getEnvironmentAvatarAdminCandidates();

    for (const endpoint of candidates) {
        try {
            const response = await fetchWithTimeout(`${endpoint}/${encodeURIComponent(avatar.agentId)}`, {
                method: "PUT",
                credentials: "include",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    displayName: avatar.displayName,
                    spriteIndex: avatar.spriteIndex,
                    caption: avatar.caption ?? "",
                    defaultSystemPrompt: avatar.defaultSystemPrompt ?? "",
                    position: avatar.position,
                    walkArea: avatar.walkArea,
                    spawnByDefault: avatar.spawnByDefault ?? false
                })
            });

            if (!response.ok) {
                continue;
            }

            const result = await response.json() as UpdateEnvironmentAvatarResponse;
            return result.agent ?? null;
        } catch (error) {
            console.warn(`Environment avatar save failed for ${endpoint}`, error);
        }
    }

    return null;
};

export const createEditableEnvironmentAvatar = async (
    seed: Pick<EditableEnvironmentAvatar, "displayName" | "spriteIndex" | "caption" | "defaultSystemPrompt" | "position" | "walkArea" | "spawnByDefault" | "characterRole">
): Promise<EditableEnvironmentAvatar | null> => {
    const candidates = getEnvironmentAvatarAdminCandidates();

    for (const endpoint of candidates) {
        try {
            const response = await fetchWithTimeout(endpoint, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    displayName: seed.displayName,
                    spriteIndex: seed.spriteIndex,
                    caption: seed.caption ?? "",
                    defaultSystemPrompt: seed.defaultSystemPrompt ?? "",
                    position: seed.position,
                    walkArea: seed.walkArea,
                    spawnByDefault: seed.spawnByDefault ?? true,
                    characterRole: seed.characterRole ?? "custom"
                })
            });

            if (!response.ok) {
                continue;
            }

            const result = await response.json() as CreateEnvironmentAvatarResponse;
            return result.agent ?? null;
        } catch (error) {
            console.warn(`Environment avatar create failed for ${endpoint}`, error);
        }
    }

    return null;
};
