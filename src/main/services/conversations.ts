import { getBackendEndpointCandidates } from "../runtimeConfig";

export type ConversationParticipantType = "user" | "agent";

export interface StoredConversationMessage {
    role: "system" | "user" | "assistant";
    content: string;
    senderId: string;
    senderType: "system" | "user" | "agent";
    senderName?: string;
    createdAt: string;
}

export interface StoredConversation {
    conversationId: string;
    participantOne: {
        participantId: string;
        participantType: ConversationParticipantType;
        displayName?: string;
    };
    participantTwo: {
        participantId: string;
        participantType: ConversationParticipantType;
        displayName?: string;
    };
    lastSessionId?: string;
    updatedAt: string;
    messages: StoredConversationMessage[];
}

const getConversationEndpointCandidates = (participantType: ConversationParticipantType, participantId: string, participantName?: string): string[] => {
    const encodedParticipantId = encodeURIComponent(participantId);
    const suffix = participantName ? `?name=${encodeURIComponent(participantName)}` : "";
    return getBackendEndpointCandidates(`/api/conversations/${participantType}/${encodedParticipantId}${suffix}`);
};

const getConversationMessageEndpointCandidates = (participantType: ConversationParticipantType, participantId: string): string[] => {
    const encodedParticipantId = encodeURIComponent(participantId);
    return getBackendEndpointCandidates(`/api/conversations/${participantType}/${encodedParticipantId}/messages`);
};

export const fetchConversation = async (
    participantType: ConversationParticipantType,
    participantId: string,
    participantName?: string
): Promise<StoredConversation | null> => {
    const endpoints = getConversationEndpointCandidates(participantType, participantId, participantName);

    for (const endpoint of endpoints) {
        try {
            const response = await fetch(endpoint, {
                method: "GET",
                credentials: "include",
                headers: {
                    "Accept": "application/json"
                }
            });

            if (!response.ok) {
                continue;
            }

            const result = await response.json() as { conversation?: StoredConversation | null };
            return result.conversation ?? null;
        } catch (error) {
            console.warn(`Conversation fetch failed for ${endpoint}`, error);
        }
    }

    return null;
};

export const appendConversationMessage = async (args: {
    participantType: ConversationParticipantType;
    participantId: string;
    participantName?: string;
    text: string;
    senderId?: string;
    senderName?: string;
}): Promise<StoredConversation | null> => {
    const endpoints = getConversationMessageEndpointCandidates(args.participantType, args.participantId);

    for (const endpoint of endpoints) {
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify({
                    text: args.text,
                    senderId: args.senderId,
                    senderName: args.senderName,
                    participantName: args.participantName
                })
            });

            if (!response.ok) {
                continue;
            }

            const result = await response.json() as { conversation?: StoredConversation | null };
            return result.conversation ?? null;
        } catch (error) {
            console.warn(`Conversation append failed for ${endpoint}`, error);
        }
    }

    return null;
};