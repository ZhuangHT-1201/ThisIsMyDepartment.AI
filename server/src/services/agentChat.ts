import { request as httpsRequest } from "https";
import type { AgentDefinition, UserProfile } from "../../../shared/types";
import type { ActivityEvent } from "../../../shared/types";
import type { ConversationMessage } from "../storage/memory/conversationStore";

export interface AgentReplyInput {
    agent: AgentDefinition;
    userId: string;
    userName: string;
    message: string;
    history: ConversationMessage[];
    profile: UserProfile;
    activities: ActivityEvent[];
    metadata?: Record<string, unknown>;
}

export interface AgentReplyResult {
    reply: string;
    metadata?: Record<string, unknown>;
}

const jsonRequest = async (args: {
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
}): Promise<any> => {
    const body = JSON.stringify(args.body);
    const requestUrl = new URL(args.url);

    return new Promise((resolve, reject) => {
        const request = httpsRequest({
            protocol: requestUrl.protocol,
            hostname: requestUrl.hostname,
            port: requestUrl.port,
            path: `${requestUrl.pathname}${requestUrl.search}`,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": String(Buffer.byteLength(body)),
                ...args.headers
            }
        }, response => {
            const chunks: Buffer[] = [];
            response.on("data", chunk => {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            });
            response.on("end", () => {
                const raw = Buffer.concat(chunks).toString("utf8");
                if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
                    reject(new Error(raw || `Upstream LLM request failed with status ${response.statusCode}`));
                    return;
                }
                try {
                    resolve(raw ? JSON.parse(raw) : {});
                } catch (error) {
                    reject(error);
                }
            });
            response.on("error", reject);
        });

        request.on("error", reject);
        request.write(body);
        request.end();
    });
};

const getChatCompletionsUrl = (baseUrl: string | undefined, fallbackBaseUrl: string): string => {
    const normalizedBaseUrl = (baseUrl?.trim() || fallbackBaseUrl).replace(/\/?$/, "/");
    return new URL("chat/completions", normalizedBaseUrl).toString();
};

const extractAssistantReply = (response: any): string | null => {
    const content = response?.choices?.[0]?.message?.content;
    if (typeof content === "string") {
        return content.trim() || null;
    }

    if (Array.isArray(content)) {
        const combined = content
            .map(part => (typeof part?.text === "string" ? part.text : ""))
            .join("\n")
            .trim();
        return combined || null;
    }

    return null;
};

const buildMockReply = (input: AgentReplyInput): AgentReplyResult => {
    const recentActivities = input.activities.slice(-3).map(activity => {
        const subject = activity.targetId ? `${activity.type} -> ${activity.targetId}` : activity.type;
        return `${activity.createdAt}: ${subject}`;
    });

    const replyParts = [
        `${input.agent.displayName} received: ${input.message}`,
        `Current user: ${input.userName} (${input.userId}).`,
        `Model route: ${input.agent.provider}/${input.agent.model}.`
    ];

    if (input.agent.defaultSystemPrompt) {
        replyParts.push(`Default prompt in use: ${input.agent.defaultSystemPrompt}`);
    }

    if (input.metadata?.ownerDisplayName && typeof input.metadata.ownerDisplayName === "string") {
        replyParts.push(`Avatar persona: ${input.metadata.ownerDisplayName}.`);
    }

    if (recentActivities.length > 0) {
        replyParts.push(`Recent activity context: ${recentActivities.join(" | ")}`);
    }

    return {
        reply: replyParts.join(" "),
        metadata: {
            provider: "mock",
            activityCount: input.activities.length
        }
    };
};

const buildOpenAIReply = async (input: AgentReplyInput): Promise<AgentReplyResult> => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return buildMockReply(input);
    }

    const messages = input.history.map(message => ({
        role: message.role,
        content: message.content
    }));

    const response = await jsonRequest({
        url: getChatCompletionsUrl(process.env.OPENAI_BASE_URL, "https://api.openai.com/v1/"),
        headers: {
            "Authorization": `Bearer ${apiKey}`
        },
        body: {
            model: input.agent.model,
            messages
        }
    });

    const reply = extractAssistantReply(response);
    if (!reply) {
        return buildMockReply(input);
    }

    return {
        reply,
        metadata: {
            provider: "openai",
            model: input.agent.model
        }
    };
};

const buildOpenRouterReply = async (input: AgentReplyInput): Promise<AgentReplyResult> => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return buildMockReply(input);
    }

    const messages = input.history.map(message => ({
        role: message.role,
        content: message.content
    }));

    const response = await jsonRequest({
        url: getChatCompletionsUrl(process.env.OPENROUTER_BASE_URL, "https://openrouter.ai/api/v1/"),
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": process.env.TIMD_FRONTEND_BASE_URL ?? "https://thisismydepartment.ai",
            "X-Title": process.env.OPENROUTER_APP_NAME ?? "ThisIsMyDepartment.AI"
        },
        body: {
            model: input.agent.model,
            messages
        }
    });

    const reply = extractAssistantReply(response);
    if (!reply) {
        return buildMockReply(input);
    }

    return {
        reply,
        metadata: {
            provider: "openrouter",
            model: input.agent.model
        }
    };
};

export const generateAgentReply = async (input: AgentReplyInput): Promise<AgentReplyResult> => {
    if (input.agent.provider === "openrouter") {
        return buildOpenRouterReply(input);
    }

    if (input.agent.provider === "openai") {
        return buildOpenAIReply(input);
    }

    return buildMockReply(input);
};