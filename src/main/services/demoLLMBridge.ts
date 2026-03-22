import agentDefinitions from "../agents/index";
import type { LLMAgentDefinition } from "../agents/AgentDefinition";
import { LLMAgentService, LLMChatResponse } from "./LLMAgentService";

const DEFAULT_AGENT_URL = "/api/agents/default/chat";
const DEFAULT_TIMEOUT_MS = 60_000;

export interface SetupBridgeOptions {
    /** Provide a custom list of agent definitions instead of auto-discovered files. */
    definitions?: LLMAgentDefinition[];
    /** Fallback endpoint when an agent definition omits its own URL. */
    endpoint?: string;
    /** Default timeout applied when a definition omits `timeoutMs`. */
    timeoutMs?: number;
}

export function setupPythonLLMBridge(options?: SetupBridgeOptions): LLMAgentDefinition[] {
    const defaults = options?.definitions ?? agentDefinitions;
    if (defaults.length === 0) {
        console.warn("No LLM agent definitions found. Falling back to a single default agent configuration.");
    }

    const resolvedDefinitions = defaults.map(definition => ({
        ...definition,
        agentUrl: definition.agentUrl ?? options?.endpoint ?? DEFAULT_AGENT_URL,
        timeoutMs: definition.timeoutMs ?? options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    }));

    const definitionByAgentId = new Map<string, LLMAgentDefinition>();
    for (const definition of resolvedDefinitions) {
        definitionByAgentId.set(definition.agentId, definition);
    }

    LLMAgentService.instance.configureBridge(async payload => {
        const definition = definitionByAgentId.get(payload.agentId);
        const endpoint = definition?.agentUrl ?? options?.endpoint ?? DEFAULT_AGENT_URL;
        const timeoutMs = definition?.timeoutMs ?? options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeout);
            if (!response.ok) {
                throw new Error(`Python agent responded with status ${response.status}`);
            }
            const result = await response.json();
            const reply = typeof result.reply === "string" ? result.reply : "";
            const history = Array.isArray(result.history) ? result.history : payload.history;
            return { reply, history } as LLMChatResponse;
        } catch (error) {
            clearTimeout(timeout);
            console.error(`LLM bridge error for agent ${payload.agentId}`, error);
            const fallbackReply = "⚠️ Python agent unavailable. Check the server logs.";
            return { reply: fallbackReply, history: payload.history };
        }
    });

    return resolvedDefinitions;
}
