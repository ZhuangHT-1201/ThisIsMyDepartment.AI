import type { IncomingMessage, ServerResponse } from "http";
import { getSessionIdFromRequest } from "../auth/session";
import { parseJsonBody } from "../http/body";
import { sendJson } from "../http/response";
import { listActivitiesForUser } from "../storage/memory/activityStore";
import { ConversationMessage, ConversationParticipantRef, getConversationForParticipants, saveConversationMessages, withConversationSystemPrompt } from "../storage/memory/conversationStore";
import { generateAgentReply } from "../services/agentChat";
import { createOrUpdateAvatarAgentForUser, getCharacterDefinitionById, getCharacterDefinitions, getCurrentProfileForUser, getCurrentUserById, getSessionContext, listCurrentUsers } from "../storage/memory/bootstrapStore";
import { isUserConnected } from "../services/realtimeServer";

const buildAgentParticipants = (args: {
    userId: string;
    userName: string;
    agentId: string;
    agentName: string;
    ownerUserId?: string;
    ownerDisplayName?: string;
}): [ConversationParticipantRef, ConversationParticipantRef] => ([
    {
        participantId: args.userId,
        participantType: "user",
        displayName: args.userName
    },
    args.ownerUserId
        ? {
            participantId: args.ownerUserId,
            participantType: "user",
            displayName: args.ownerDisplayName ?? args.agentName
        }
        : {
            participantId: args.agentId,
            participantType: "agent",
            displayName: args.agentName
        }
]);

const createUserMessage = (args: {
    userId: string;
    userName: string;
    message: string;
}): ConversationMessage => ({
    role: "user",
    content: args.message,
    senderId: args.userId,
    senderType: "user",
    senderName: args.userName,
    createdAt: new Date().toISOString()
});

const createAgentReplyMessage = (args: {
    agentId: string;
    agentName: string;
    message: string;
}): ConversationMessage => ({
    role: "assistant",
    content: args.message,
    senderId: args.agentId,
    senderType: "agent",
    senderName: args.agentName,
    createdAt: new Date().toISOString()
});

export const handleListAgentsRoute = (request: IncomingMessage, response: ServerResponse): void => {
    const agents = getCharacterDefinitions().map(agent => ({
        ...agent,
        effectiveSystemPrompt: agent.defaultSystemPrompt ?? ""
    }));

    sendJson(request, response, 200, { agents });
};

export const handleListUsersRoute = (request: IncomingMessage, response: ServerResponse): void => {
    const sessionContext = getSessionContext(getSessionIdFromRequest(request));
    if (!sessionContext) {
        sendJson(request, response, 401, { error: "Authentication required" });
        return;
    }

    const users = listCurrentUsers().map(user => {
        const profile = getCurrentProfileForUser(user.userId);
        return {
            userId: user.userId,
            displayName: user.displayName,
            organization: user.organization,
            department: user.department,
            roles: user.roles,
            avatar: profile.avatar,
            isOnline: isUserConnected(user.userId),
            hasCharacterSystemPrompt: Boolean(profile.characterSystemPrompt?.trim()),
            updatedAt: profile.updatedAt
        };
    });

    sendJson(request, response, 200, { users });
};

export const handleSpawnAvatarAgentRoute = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const sessionContext = getSessionContext(getSessionIdFromRequest(request));
    if (!sessionContext) {
        sendJson(request, response, 401, { error: "Authentication required" });
        return;
    }

    try {
        const payload = await parseJsonBody<{
            targetUserId?: string;
            position?: { x?: number; y?: number };
        }>(request);
        const targetUserId = payload.targetUserId?.trim() ?? "";
        const x = payload.position?.x;
        const y = payload.position?.y;

        if (!targetUserId) {
            sendJson(request, response, 400, { error: "Missing targetUserId" });
            return;
        }
        if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
            sendJson(request, response, 400, { error: "Missing or invalid spawn position" });
            return;
        }

        const targetUser = getCurrentUserById(targetUserId);
        if (!targetUser) {
            sendJson(request, response, 404, { error: "Unknown target user" });
            return;
        }

        if (isUserConnected(targetUserId)) {
            sendJson(request, response, 409, { error: "Target user is currently online" });
            return;
        }

        const profile = getCurrentProfileForUser(targetUserId);
        if (!profile.avatar) {
            sendJson(request, response, 400, { error: "Target user does not have a saved avatar yet" });
            return;
        }

        const agent = createOrUpdateAvatarAgentForUser(targetUserId, { x, y });
        if (!agent) {
            sendJson(request, response, 500, { error: "Failed to create avatar agent" });
            return;
        }

        sendJson(request, response, 200, { agent });
    } catch (_) {
        sendJson(request, response, 400, { error: "Invalid JSON payload" });
    }
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
        const personaUserId = agent.ownerUserId ?? user.userId;
        const personaProfile = agent.ownerUserId ? getCurrentProfileForUser(personaUserId) : sessionContext.profile;
        const personaUser = agent.ownerUserId ? getCurrentUserById(personaUserId) : sessionContext.user;
        const effectiveSystemPrompt = personaProfile.characterSystemPrompt?.trim() || agent.defaultSystemPrompt;
        const userName = payload.playerName ?? user.displayName;
        const participants = buildAgentParticipants({
            userId: user.userId,
            userName,
            agentId,
            agentName: agent.displayName,
            ownerUserId: agent.ownerUserId,
            ownerDisplayName: personaUser?.displayName
        });
        const conversation = getConversationForParticipants(participants);
        const preparedMessages = withConversationSystemPrompt(conversation?.messages ?? [], effectiveSystemPrompt);

        const nextHistory = preparedMessages.concat(createUserMessage({
            userId: user.userId,
            userName,
            message
        }));
        const reply = await generateAgentReply({
            agent,
            userId: user.userId,
            userName,
            message,
            history: nextHistory,
            profile: personaProfile,
            activities: listActivitiesForUser(personaUserId, 10),
            metadata: personaUser ? {
                ownerUserId: personaUser.userId,
                ownerDisplayName: personaUser.displayName
            } : undefined
        });

        const assistantMessage = reply.reply.trim();
        const persistedMessages = assistantMessage
            ? nextHistory.concat(createAgentReplyMessage({
                agentId,
                agentName: agent.displayName,
                message: assistantMessage
            }))
            : nextHistory;
        const savedConversation = saveConversationMessages({
            participants,
            sessionId: session.sessionId,
            messages: persistedMessages
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