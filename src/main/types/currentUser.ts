export interface CurrentUserProfile {
    avatar?: {
        spriteIndex: number;
        updatedAt: string;
    };
    characterSystemPrompt?: string;
    preferences: Record<string, unknown>;
    updatedAt: string;
}

export interface CurrentUser {
    userId: string;
    displayName: string;
    externalId?: string;
    email?: string;
    organization?: string;
    department?: string;
    roles: string[];
}

export interface CurrentSession {
    sessionId: string;
    userId: string;
    clientType: "web" | "electron";
    startedAt: string;
    expiresAt?: string;
}

export interface BootstrapAgentDefinition {
    agentId: string;
    displayName: string;
    spriteIndex: number;
    position: { x: number; y: number };
    caption?: string;
    defaultSystemPrompt?: string;
    provider: "mock" | "openai" | "openrouter" | "anthropic" | "ollama" | "azure-openai";
    model: string;
    walkArea?: { x: number; y: number; width: number; height: number };
    characterRole?: "teacher" | "student" | "staff" | "custom";
    ownerUserId?: string;
    spawnByDefault?: boolean;
    updatedAt?: string;
}

export interface BootstrapState {
    authenticated: boolean;
    user: CurrentUser | null;
    profile: CurrentUserProfile | null;
    session: CurrentSession | null;
    agents: BootstrapAgentDefinition[];
    room: {
        roomId: string;
        displayName: string;
    } | null;
    loginUrl?: string | null;
}