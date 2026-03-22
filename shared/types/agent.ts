export interface AgentScenePosition {
    x: number;
    y: number;
}

export interface AgentWalkArea {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface AgentDefinition {
    agentId: string;
    displayName: string;
    spriteIndex: number;
    position: AgentScenePosition;
    caption?: string;
    defaultSystemPrompt?: string;
    provider: "mock" | "openai" | "anthropic" | "ollama" | "azure-openai";
    model: string;
    walkArea?: AgentWalkArea;
    characterRole?: "teacher" | "student" | "staff" | "custom";
    ownerUserId?: string;
    spawnByDefault?: boolean;
    updatedAt?: string;
}

export interface AgentChatRequest {
    agentId: string;
    message: string;
    sessionId?: string;
}

export interface AgentChatResponse {
    reply: string;
    conversationId: string;
    messageId: string;
    metadata?: Record<string, unknown>;
}