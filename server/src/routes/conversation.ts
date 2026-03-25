import type { IncomingMessage, ServerResponse } from "http";
import { getSessionIdFromRequest } from "../auth/session";
import { parseJsonBody } from "../http/body";
import { sendJson } from "../http/response";
import { ConversationMessage, ConversationParticipantRef, getConversationForParticipants, saveConversationMessages } from "../storage/memory/conversationStore";
import { getCharacterDefinitionById, getCurrentUserById, getSessionContext } from "../storage/memory/bootstrapStore";

type SupportedParticipantType = "user" | "agent";

const isSupportedParticipantType = (value: string): value is SupportedParticipantType => {
    return value === "user" || value === "agent";
};

const buildParticipants = (args: {
    currentUserId: string;
    currentUserName: string;
    participantType: SupportedParticipantType;
    participantId: string;
    participantName?: string;
}): [ConversationParticipantRef, ConversationParticipantRef] | null => {
    const participantId = args.participantId.trim();
    if (!participantId) {
        return null;
    }

    if (args.participantType === "user") {
        if (participantId === args.currentUserId) {
            return null;
        }
        const user = getCurrentUserById(participantId);
        return [
            {
                participantId: args.currentUserId,
                participantType: "user",
                displayName: args.currentUserName
            },
            {
                participantId,
                participantType: "user",
                displayName: user?.displayName ?? args.participantName ?? participantId
            }
        ];
    }

    const agent = getCharacterDefinitionById(participantId);
    if (!agent) {
        return null;
    }

    if (agent.ownerUserId) {
        if (agent.ownerUserId === args.currentUserId) {
            return null;
        }

        const ownerUser = getCurrentUserById(agent.ownerUserId);
        return [
            {
                participantId: args.currentUserId,
                participantType: "user",
                displayName: args.currentUserName
            },
            {
                participantId: agent.ownerUserId,
                participantType: "user",
                displayName: ownerUser?.displayName ?? agent.displayName
            }
        ];
    }

    return [
        {
            participantId: args.currentUserId,
            participantType: "user",
            displayName: args.currentUserName
        },
        {
            participantId,
            participantType: "agent",
            displayName: agent.displayName
        }
    ];
};

const senderRoleForType = (senderType: ConversationMessage["senderType"]): ConversationMessage["role"] => {
    if (senderType === "agent") {
        return "assistant";
    }
    if (senderType === "system") {
        return "system";
    }
    return "user";
};

export const handleGetConversationRoute = (
    request: IncomingMessage,
    response: ServerResponse,
    participantTypeValue: string,
    participantId: string,
    requestUrl: URL
): void => {
    const sessionContext = getSessionContext(getSessionIdFromRequest(request));
    if (!sessionContext) {
        sendJson(request, response, 401, { error: "Authentication required" });
        return;
    }

    if (!isSupportedParticipantType(participantTypeValue)) {
        sendJson(request, response, 400, { error: "Unsupported participant type" });
        return;
    }

    const participants = buildParticipants({
        currentUserId: sessionContext.user.userId,
        currentUserName: sessionContext.user.displayName,
        participantType: participantTypeValue,
        participantId,
        participantName: requestUrl.searchParams.get("name") ?? undefined
    });

    if (!participants) {
        sendJson(request, response, 404, { error: "Conversation participant not found" });
        return;
    }

    const conversation = getConversationForParticipants(participants) ?? null;
    sendJson(request, response, 200, { conversation });
};

export const handleAppendConversationMessageRoute = async (
    request: IncomingMessage,
    response: ServerResponse,
    participantTypeValue: string,
    participantId: string
): Promise<void> => {
    const sessionContext = getSessionContext(getSessionIdFromRequest(request));
    if (!sessionContext) {
        sendJson(request, response, 401, { error: "Authentication required" });
        return;
    }

    if (!isSupportedParticipantType(participantTypeValue)) {
        sendJson(request, response, 400, { error: "Unsupported participant type" });
        return;
    }

    try {
        const payload = await parseJsonBody<{
            text?: string;
            senderId?: string;
            senderName?: string;
            participantName?: string;
        }>(request);
        const text = payload.text?.trim() ?? "";
        if (!text) {
            sendJson(request, response, 400, { error: "Missing text" });
            return;
        }

        const participants = buildParticipants({
            currentUserId: sessionContext.user.userId,
            currentUserName: sessionContext.user.displayName,
            participantType: participantTypeValue,
            participantId,
            participantName: payload.participantName
        });
        if (!participants) {
            sendJson(request, response, 404, { error: "Conversation participant not found" });
            return;
        }

        const requestedSenderId = payload.senderId?.trim();
        const participantSenderId = participants[1].participantId;
        const senderId = requestedSenderId && (requestedSenderId === sessionContext.user.userId || requestedSenderId === participantSenderId)
            ? requestedSenderId
            : sessionContext.user.userId;
        const senderType: ConversationMessage["senderType"] = senderId === sessionContext.user.userId
            ? "user"
            : participants[1].participantType;
        const senderName = senderId === sessionContext.user.userId
            ? sessionContext.user.displayName
            : payload.senderName?.trim() || participants[1].displayName || participants[1].participantId;

        const conversation = getConversationForParticipants(participants);
        const message: ConversationMessage = {
            role: senderRoleForType(senderType),
            content: text,
            senderId,
            senderType,
            senderName,
            createdAt: new Date().toISOString()
        };
        const savedConversation = saveConversationMessages({
            participants,
            sessionId: sessionContext.session.sessionId,
            messages: [...(conversation?.messages ?? []), message]
        });

        sendJson(request, response, 201, {
            conversation: savedConversation,
            message
        });
    } catch (_error) {
        sendJson(request, response, 400, { error: "Invalid JSON payload" });
    }
};