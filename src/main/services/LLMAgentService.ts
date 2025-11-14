import { clamp } from "../../engine/util/math";

export type LLMChatRole = "system" | "user" | "assistant";

export interface LLMChatMessage {
    role: LLMChatRole;
    content: string;
}

export interface LLMChatRequest {
    agentId: string;
    playerId: string;
    playerName?: string;
    message: string;
    history: LLMChatMessage[];
    metadata?: Record<string, unknown>;
}

export interface LLMChatResponse {
    reply: string;
    history?: LLMChatMessage[];
    metadata?: Record<string, unknown>;
    raw?: unknown;
}

export type LLMChatBridge = (request: LLMChatRequest) => Promise<LLMChatResponse | string>;

/**
 * Central service that forwards chat prompts to the configured LLM bridge.
 * Plug your own agent by calling {@link LLMAgentService.instance.configureBridge} once during app startup.
 */
export class LLMAgentService {
    private static _instance: LLMAgentService;

    public static get instance(): LLMAgentService {
        if (!LLMAgentService._instance) {
            LLMAgentService._instance = new LLMAgentService();
        }
        return LLMAgentService._instance;
    }

    private bridge: LLMChatBridge | null = null;

    private constructor() {}

    /**
     * Register the bridge that ultimately talks to your LLM agent.
     */
    public configureBridge(bridge: LLMChatBridge): void {
        this.bridge = bridge;
    }

    /**
     * Sends a request to the configured bridge. Throws if no bridge has been configured yet.
     */
    public async send(request: LLMChatRequest): Promise<LLMChatResponse> {
        if (this.bridge == null) {
            throw new Error("LLM agent bridge is not configured. Call LLMAgentService.instance.configureBridge first.");
        }
        const result = await this.bridge(request);
        if (typeof result === "string") {
            return { reply: result };
        }
        if (!result.reply) {
            // Basic guard to avoid empty bubbles if a bridge forgets to set the reply.
            const history = result.history ?? request.history;
            const lastAssistantMessage = [...history].reverse().find(entry => entry.role === "assistant");
            return { ...result, reply: lastAssistantMessage?.content ?? "" };
        }
        return result;
    }

    /**
     * Utility to estimate how long a message bubble should stay visible.
     */
    public estimateSpeechDuration(text: string): number {
        if (!text.trim()) {
            return 0;
        }
        return clamp(3 + text.length / 18, 3, 12);
    }
}

export const configureLLMAgentBridge = (bridge: LLMChatBridge): void => {
    LLMAgentService.instance.configureBridge(bridge);
};
