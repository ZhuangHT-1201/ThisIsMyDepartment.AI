import type { AgentDefinition } from "../../../../shared/types";
import { getConversationRecord, setConversationRecord } from "../stateStore";

export type ConversationRole = "system" | "user" | "assistant";
export type ConversationParticipantType = "user" | "agent";
export type ConversationMessageSenderType = ConversationParticipantType | "system";

export interface ConversationParticipantRef {
    participantId: string;
    participantType: ConversationParticipantType;
    displayName?: string;
}

export interface ConversationMessage {
    role: ConversationRole;
    content: string;
    senderId: string;
    senderType: ConversationMessageSenderType;
    senderName?: string;
    createdAt: string;
}

export interface StoredConversation {
    conversationId: string;
    participantOne: ConversationParticipantRef;
    participantTwo: ConversationParticipantRef;
    lastSessionId?: string;
    updatedAt: string;
    messages: ConversationMessage[];
}

const now = (): string => new Date().toISOString();

const createSystemMessage = (prompt: string, createdAt = now()): ConversationMessage => ({
    role: "system",
    content: prompt,
    senderId: "system",
    senderType: "system",
    senderName: "System",
    createdAt
});

const cloneParticipant = (participant: ConversationParticipantRef): ConversationParticipantRef => ({
    ...participant
});

const cloneConversation = (conversation: StoredConversation): StoredConversation => ({
    ...conversation,
    participantOne: cloneParticipant(conversation.participantOne),
    participantTwo: cloneParticipant(conversation.participantTwo),
    messages: conversation.messages.map(message => ({ ...message }))
});

const normalizeParticipants = (participants: [ConversationParticipantRef, ConversationParticipantRef]): [ConversationParticipantRef, ConversationParticipantRef] => {
    const cloned = participants.map(participant => cloneParticipant(participant)) as [ConversationParticipantRef, ConversationParticipantRef];
    cloned.sort((left, right) => {
        const leftKey = `${left.participantType}:${left.participantId}`;
        const rightKey = `${right.participantType}:${right.participantId}`;
        return leftKey.localeCompare(rightKey);
    });
    return cloned;
};

const buildConversationKey = (participants: [ConversationParticipantRef, ConversationParticipantRef]): string => {
    const [participantOne, participantTwo] = normalizeParticipants(participants);
    return `${participantOne.participantType}:${participantOne.participantId}|${participantTwo.participantType}:${participantTwo.participantId}`;
};

const createConversationId = (participants: [ConversationParticipantRef, ConversationParticipantRef]): string => {
    return `conversation-${buildConversationKey(participants).replace(/[^a-zA-Z0-9:_|-]+/g, "-")}`;
};

export const getConversationForParticipants = (participants: [ConversationParticipantRef, ConversationParticipantRef]): StoredConversation | undefined => {
    const key = buildConversationKey(participants);
    const existing = getConversationRecord(key);
    return existing ? cloneConversation(existing) : undefined;
};

export const getOrCreateConversation = (args: {
    userId: string;
    userName: string;
    sessionId?: string;
    agent: AgentDefinition;
    systemPrompt?: string;
}): StoredConversation => {
    const participants: [ConversationParticipantRef, ConversationParticipantRef] = [
        {
            participantId: args.userId,
            participantType: "user",
            displayName: args.userName
        },
        {
            participantId: args.agent.agentId,
            participantType: "agent",
            displayName: args.agent.displayName
        }
    ];
    const key = buildConversationKey(participants);
    const existing = getConversationRecord(key);
    if (existing) {
        return cloneConversation(existing);
    }

    const [participantOne, participantTwo] = normalizeParticipants(participants);
    const messages: ConversationMessage[] = [];
    if (args.systemPrompt && args.systemPrompt.trim().length > 0) {
        messages.push(createSystemMessage(args.systemPrompt.trim()));
    }

    const created: StoredConversation = {
        conversationId: createConversationId(participants),
        participantOne,
        participantTwo,
        lastSessionId: args.sessionId,
        updatedAt: now(),
        messages
    };
    return setConversationRecord(key, created);
};

export const saveConversationMessages = (args: {
    participants: [ConversationParticipantRef, ConversationParticipantRef];
    sessionId?: string;
    messages: ConversationMessage[];
}): StoredConversation => {
    const key = buildConversationKey(args.participants);
    const previous = getConversationRecord(key);
    const [participantOne, participantTwo] = normalizeParticipants(args.participants);
    const stored: StoredConversation = {
        conversationId: previous?.conversationId ?? createConversationId(args.participants),
        participantOne,
        participantTwo,
        lastSessionId: args.sessionId ?? previous?.lastSessionId,
        updatedAt: now(),
        messages: args.messages.map(message => ({ ...message }))
    };
    return setConversationRecord(key, stored);
};

export const resetConversation = (args: {
    participants: [ConversationParticipantRef, ConversationParticipantRef];
    sessionId?: string;
    systemPrompt?: string;
}): StoredConversation => {
    const key = buildConversationKey(args.participants);
    const [participantOne, participantTwo] = normalizeParticipants(args.participants);
    const messages: ConversationMessage[] = [];
    if (args.systemPrompt && args.systemPrompt.trim().length > 0) {
        messages.push(createSystemMessage(args.systemPrompt.trim()));
    }

    const resetState: StoredConversation = {
        conversationId: createConversationId(args.participants),
        participantOne,
        participantTwo,
        lastSessionId: args.sessionId,
        updatedAt: now(),
        messages
    };
    return setConversationRecord(key, resetState);
};

export const withConversationSystemPrompt = (messages: ConversationMessage[], systemPrompt?: string): ConversationMessage[] => {
    const trimmedPrompt = systemPrompt?.trim() ?? "";
    const nonSystemMessages = messages
        .filter(message => message.senderType !== "system")
        .map(message => ({ ...message }));

    if (!trimmedPrompt) {
        return nonSystemMessages;
    }

    const existingSystemMessage = messages.find(message => message.senderType === "system");
    return [createSystemMessage(trimmedPrompt, existingSystemMessage?.createdAt), ...nonSystemMessages];
};