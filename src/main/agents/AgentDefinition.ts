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
    /** Endpoint URL that should handle this agent's chat requests. */
    agentUrl: string;
    /** Optional caption shown above the agent when idle. */
    caption?: string;
    /** Optional system prompt seeded into the conversation history. */
    systemPrompt?: string;
    /** Override for request timeout in milliseconds. */
    timeoutMs?: number;
    /** Optional axis-aligned rectangle (scene coordinates) the agent is allowed to wander inside. */
    walkArea?: { x: number; y: number; width: number; height: number };
}
