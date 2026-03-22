export interface UserAvatarProfile {
    spriteIndex: number;
    updatedAt: string;
}

export interface UserProfile {
    userId: string;
    avatar?: UserAvatarProfile;
    characterSystemPrompt?: string;
    preferences: Record<string, unknown>;
    updatedAt: string;
}