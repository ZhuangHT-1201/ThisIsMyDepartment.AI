import { LLMAgentService, LLMChatResponse } from "./LLMAgentService";
import { getBackendEndpointCandidates } from "../runtimeConfig";

const getAgentChatEndpointCandidates = (agentId: string): string[] => {
    const encodedAgentId = encodeURIComponent(agentId);
    return getBackendEndpointCandidates(`/api/agents/${encodedAgentId}/chat`);
};

export const configureBackendLLMBridge = (): void => {
    LLMAgentService.instance.configureBridge(async payload => {
        const endpoints = getAgentChatEndpointCandidates(payload.agentId);

        for (const endpoint of endpoints) {
            try {
                const response = await fetch(endpoint, {
                    method: "POST",
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

                const result = await response.json() as LLMChatResponse;
                return {
                    reply: result.reply ?? "",
                    history: Array.isArray(result.history) ? result.history : payload.history,
                    metadata: result.metadata,
                    raw: result.raw
                };
            } catch (error) {
                console.warn(`Backend LLM bridge failed for ${endpoint}`, error);
            }
        }

        return {
            reply: "Backend agent service is unavailable. Start the local server or configure a hosted backend.",
            history: payload.history
        };
    });
};