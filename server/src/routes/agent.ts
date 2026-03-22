import type { IncomingMessage, ServerResponse } from "http";
import { getSessionIdFromRequest } from "../auth/session";
import { parseJsonBody } from "../http/body";
import { sendJson } from "../http/response";
import { listActivitiesForUser } from "../storage/memory/activityStore";
import { ConversationParticipantRef, getOrCreateConversation, saveConversationMessages } from "../storage/memory/conversationStore";
import { generateAgentReply } from "../services/agentChat";
import { getCharacterDefinitionById, getCharacterDefinitions, getSessionContext } from "../storage/memory/bootstrapStore";

const buildAgentParticipants = (userId: string, userName: string, agentId: string, agentName: string): [ConversationParticipantRef, ConversationParticipantRef] => ([
    {
        participantId: userId,
        participantType: "user",
        displayName: userName
    },
    {
        participantId: agentId,
        participantType: "agent",
        displayName: agentName
    }
]);

export const handleListAgentsRoute = (request: IncomingMessage, response: ServerResponse): void => {
    const agents = getCharacterDefinitions().map(agent => ({
        ...agent,
        effectiveSystemPrompt: agent.defaultSystemPrompt ?? ""
    }));

    sendJson(request, response, 200, { agents });
};

export const handleChatWithAgentRoute = async (request: IncomingMessage, response: ServerResponse, agentId: string): Promise<void> => {
    const sessionContext = getSessionContext(getSessionIdFromRequest(request));
    if (!sessionContext) {
        sendJson(request, response, 401, { error: "Authentication required" });
        return;
    }

    try {
        const payload = await parseJsonBody<{
            message?: string;
            playerName?: string;
            metadata?: Record<string, unknown>;
        }>(request);
        const message = payload.message?.trim() ?? "";
        if (!message) {
            sendJson(request, response, 400, { error: "Missing message" });
            return;
        }

        const agent = getCharacterDefinitionById(agentId);
        if (!agent) {
            sendJson(request, response, 404, { error: "Unknown agent" });
            return;
        }

        const user = sessionContext.user;
        const session = sessionContext.session;
        const profile = sessionContext.profile;
        const userName = payload.playerName ?? user.displayName;
        const participants = buildAgentParticipants(user.userId, userName, agentId, agent.displayName);
        const conversation = getOrCreateConversation({
            userId: user.userId,
            userName,
            sessionId: session.sessionId,
            agent,
            systemPrompt: agent.defaultSystemPrompt
        });

        const nextHistory = conversation.messages.concat({
            role: "user",
            content: message,
            senderId: user.userId,
            senderType: "user",
            senderName: userName,
            createdAt: new Date().toISOString()
        });
        const reply = await generateAgentReply({
            agent,
            userId: user.userId,
            userName,
            message,
            history: nextHistory,
            profile,
            activities: listActivitiesForUser(user.userId, 10)
        });

        const assistantMessage = reply.reply.trim();
        const savedConversation = saveConversationMessages({
            participants,
            sessionId: session.sessionId,
            messages: assistantMessage
                ? nextHistory.concat({
                    role: "assistant",
                    content: assistantMessage,
                    senderId: agentId,
                    senderType: "agent",
                    senderName: agent.displayName,
                    createdAt: new Date().toISOString()
                })
                : nextHistory
        });

        sendJson(request, response, 200, {
            reply: assistantMessage,
            conversationId: savedConversation.conversationId,
            messageId: `message-${Date.now()}`,
            history: savedConversation.messages,
            metadata: reply.metadata ?? {}
        });
    } catch (_) {
        sendJson(request, response, 400, { error: "Invalid JSON payload" });
    }
};