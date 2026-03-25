export interface LLMAgentDefinition {
    /** Unique DOM id for the scene graph node. */
    id: string;
    /** Logical agent identifier routed through the LLM bridge. */
    agentId: string;
    /** Display name shown in conversation window. */
    displayName: string;
    /** Index into the character sprite sheet. */
    spriteIndex: number;
    /** Initial scene position in pixels. */
    position: { x: number; y: number };
    /** Optional caption shown above the agent when idle. */
    caption?: string;
    /** Optional system prompt seeded into the conversation history. */
    systemPrompt?: string;
    /** Provider/model metadata supplied by backend bootstrap when available. */
    provider?: "mock" | "openai" | "openrouter" | "anthropic" | "ollama" | "azure-openai";
    model?: string;
    /** Deprecated fields kept for compatibility with generated local agent definitions. */
    agentUrl?: string;
    timeoutMs?: number;
    /** Optional axis-aligned rectangle (scene coordinates) the agent is allowed to wander inside. */
    walkArea?: { x: number; y: number; width: number; height: number };
    /** Whether this agent should appear automatically when the scene loads. */
    spawnByDefault?: boolean;
}
