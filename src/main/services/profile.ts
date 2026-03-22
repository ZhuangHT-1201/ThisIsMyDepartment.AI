import type { CurrentUser, CurrentUserProfile } from "../types/currentUser";
import { getBackendEndpointCandidates } from "../runtimeConfig";

interface ProfileResponse {
    user: CurrentUser;
    profile: CurrentUserProfile;
}

const getProfileEndpointCandidates = (): string[] => {
    return getBackendEndpointCandidates("/api/me/profile");
};

const saveProfileUpdate = async (payload: Record<string, unknown>): Promise<ProfileResponse | null> => {
    const endpoints = getProfileEndpointCandidates();

    for (const endpoint of endpoints) {
        try {
            const response = await fetch(endpoint, {
                method: "PUT",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                continue;
            }

            return await response.json() as ProfileResponse;
        } catch (error) {
            console.warn(`Profile update failed for ${endpoint}`, error);
        }
    }

    return null;
};

export const saveAvatarProfile = async (spriteIndex: number): Promise<ProfileResponse | null> => {
    return saveProfileUpdate({
        avatar: {
            spriteIndex
        }
    });
};

export const saveCharacterSystemPrompt = async (characterSystemPrompt: string): Promise<ProfileResponse | null> => {
    return saveProfileUpdate({
        characterSystemPrompt
    });
};