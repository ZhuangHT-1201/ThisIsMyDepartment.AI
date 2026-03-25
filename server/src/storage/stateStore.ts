import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import type { ActivityEvent, AgentDefinition, AppSession, DepartmentUser, UserProfile } from "../../../shared/types";
import type { ConversationMessage, ConversationParticipantRef } from "./memory/conversationStore";

interface StoredConversationRecord {
    conversationId: string;
    participantOne: ConversationParticipantRef;
    participantTwo: ConversationParticipantRef;
    lastSessionId?: string;
    updatedAt: string;
    messages: ConversationMessage[];
}

interface PersistedState {
    usersById: Record<string, DepartmentUser>;
    profilesByUserId: Record<string, UserProfile>;
    charactersById: Record<string, AgentDefinition>;
    sessionsById: Record<string, AppSession>;
    externalIdentityIndex: Record<string, string>;
    activityLog: ActivityEvent[];
    conversationsByKey: Record<string, StoredConversationRecord>;
}

const DEFAULT_STATE: PersistedState = {
    usersById: {},
    profilesByUserId: {},
    charactersById: {},
    sessionsById: {},
    externalIdentityIndex: {},
    activityLog: [],
    conversationsByKey: {}
};

const cloneAgentDefinition = (definition: AgentDefinition): AgentDefinition => ({
    ...definition,
    position: { ...definition.position },
    walkArea: definition.walkArea ? { ...definition.walkArea } : undefined
});

const serverPackageRoot = resolve(__dirname, "../../../..");

const resolveFromServerRoot = (targetPath: string): string => {
    return resolve(serverPackageRoot, targetPath);
};

const resolveDatabaseFilePath = (): string => {
    const configuredPath = process.env.SERVER_STATE_DB_FILE?.trim() || process.env.SERVER_STATE_FILE?.trim();
    if (configuredPath) {
        return resolveFromServerRoot(configuredPath);
    }

    return resolveFromServerRoot("data/state.sqlite");
};

const resolveLegacyJsonFilePath = (): string => {
    const configuredPath = process.env.SERVER_STATE_FILE?.trim();
    if (configuredPath && configuredPath.endsWith(".json")) {
        return resolveFromServerRoot(configuredPath);
    }

    return resolveFromServerRoot("data/state.json");
};

const stateFilePath = resolveDatabaseFilePath();
const legacyJsonFilePath = resolveLegacyJsonFilePath();

const cloneState = (state: PersistedState): PersistedState => JSON.parse(JSON.stringify(state)) as PersistedState;

const normalizeLegacyConversationRecord = (conversationKey: string, conversation: any): StoredConversationRecord => {
    const participantOne: ConversationParticipantRef = conversation.participantOne ?? {
        participantId: conversation.userId ?? conversationKey.split("|")[0]?.split(":").slice(1).join(":") ?? "unknown",
        participantType: "user",
        displayName: undefined
    };
    const participantTwo: ConversationParticipantRef = conversation.participantTwo ?? {
        participantId: conversation.agentId ?? conversationKey.split("|")[1]?.split(":").slice(1).join(":") ?? "unknown",
        participantType: "agent",
        displayName: undefined
    };

    return {
        conversationId: conversation.conversationId,
        participantOne,
        participantTwo,
        lastSessionId: conversation.lastSessionId ?? conversation.sessionId,
        updatedAt: conversation.updatedAt ?? new Date(0).toISOString(),
        messages: Array.isArray(conversation.messages)
            ? conversation.messages.map((message: ConversationMessage) => ({ ...message }))
            : []
    };
};

const sanitizeState = (candidate: unknown): PersistedState => {
    if (!candidate || typeof candidate !== "object") {
        return cloneState(DEFAULT_STATE);
    }

    const value = candidate as Partial<PersistedState>;
    return {
        usersById: value.usersById && typeof value.usersById === "object" ? { ...value.usersById } : {},
        profilesByUserId: value.profilesByUserId && typeof value.profilesByUserId === "object" ? { ...value.profilesByUserId } : {},
        charactersById: value.charactersById && typeof value.charactersById === "object"
            ? Object.fromEntries(Object.entries(value.charactersById).map(([key, character]) => [key, cloneAgentDefinition(character as AgentDefinition)]))
            : {},
        sessionsById: value.sessionsById && typeof value.sessionsById === "object" ? { ...value.sessionsById } : {},
        externalIdentityIndex: value.externalIdentityIndex && typeof value.externalIdentityIndex === "object" ? { ...value.externalIdentityIndex } : {},
        activityLog: Array.isArray(value.activityLog) ? value.activityLog.map(activity => ({ ...activity })) : [],
        conversationsByKey: value.conversationsByKey && typeof value.conversationsByKey === "object"
            ? Object.fromEntries(Object.entries(value.conversationsByKey).map(([key, conversation]) => [key, normalizeLegacyConversationRecord(key, conversation)]))
            : {}
    };
};

const loadLegacyJsonState = (): PersistedState => {
    if (!existsSync(legacyJsonFilePath)) {
        return cloneState(DEFAULT_STATE);
    }

    try {
        const raw = readFileSync(legacyJsonFilePath, "utf8");
        if (!raw.trim()) {
            return cloneState(DEFAULT_STATE);
        }
        return sanitizeState(JSON.parse(raw));
    } catch (error) {
        console.warn(`Failed to load legacy server state from ${legacyJsonFilePath}:`, error);
        return cloneState(DEFAULT_STATE);
    }
};

mkdirSync(dirname(stateFilePath), { recursive: true });
const database = new Database(stateFilePath);
database.pragma("journal_mode = WAL");

database.exec(`
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    external_id TEXT,
    email TEXT,
    organization TEXT,
    department TEXT,
    roles_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
    user_id TEXT PRIMARY KEY,
    avatar_json TEXT,
    character_system_prompt TEXT,
    preferences_json TEXT NOT NULL,
    prompt_overrides_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS characters (
    agent_id TEXT PRIMARY KEY,
    definition_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    client_type TEXT NOT NULL,
    started_at TEXT NOT NULL,
    expires_at TEXT
);

CREATE TABLE IF NOT EXISTS external_identity_index (
    external_key TEXT PRIMARY KEY,
    user_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
    activity_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    target_id TEXT,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_user_created_at ON activities (user_id, created_at);

CREATE TABLE IF NOT EXISTS conversations (
    conversation_key TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    participant_one_id TEXT,
    participant_one_type TEXT,
    participant_one_display_name TEXT,
    participant_two_id TEXT,
    participant_two_type TEXT,
    participant_two_display_name TEXT,
    session_id TEXT,
    updated_at TEXT,
    messages_json TEXT NOT NULL
);
`);

const ensureColumnExists = (tableName: string, columnName: string, definition: string): void => {
    const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    if (!columns.some(column => column.name === columnName)) {
        database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
};

ensureColumnExists("conversations", "participant_one_id", "TEXT");
ensureColumnExists("conversations", "participant_one_type", "TEXT");
ensureColumnExists("conversations", "participant_one_display_name", "TEXT");
ensureColumnExists("conversations", "participant_two_id", "TEXT");
ensureColumnExists("conversations", "participant_two_type", "TEXT");
ensureColumnExists("conversations", "participant_two_display_name", "TEXT");
ensureColumnExists("conversations", "user_id", "TEXT");
ensureColumnExists("conversations", "agent_id", "TEXT");
ensureColumnExists("conversations", "updated_at", "TEXT");
ensureColumnExists("profiles", "character_system_prompt", "TEXT");

const selectCountsStatement = database.prepare(`
    SELECT
        (SELECT COUNT(*) FROM users) AS userCount,
        (SELECT COUNT(*) FROM profiles) AS profileCount,
    (SELECT COUNT(*) FROM characters) AS characterCount,
        (SELECT COUNT(*) FROM sessions) AS sessionCount,
        (SELECT COUNT(*) FROM external_identity_index) AS externalIdentityCount,
        (SELECT COUNT(*) FROM activities) AS activityCount,
        (SELECT COUNT(*) FROM conversations) AS conversationCount
`);

const isDatabaseEmpty = (): boolean => {
    const counts = selectCountsStatement.get() as {
        userCount: number;
        profileCount: number;
        characterCount: number;
        sessionCount: number;
        externalIdentityCount: number;
        activityCount: number;
        conversationCount: number;
    };

    return counts.userCount === 0
        && counts.profileCount === 0
        && counts.characterCount === 0
        && counts.sessionCount === 0
        && counts.externalIdentityCount === 0
        && counts.activityCount === 0
        && counts.conversationCount === 0;
};

const parseJsonObject = <T>(value: string | null | undefined, fallback: T): T => {
    if (!value) {
        return fallback;
    }

    try {
        return JSON.parse(value) as T;
    } catch (_error) {
        return fallback;
    }
};

const serialize = (value: unknown): string => JSON.stringify(value);

const cloneConversation = (conversation: StoredConversationRecord): StoredConversationRecord => ({
    ...conversation,
    participantOne: { ...conversation.participantOne },
    participantTwo: { ...conversation.participantTwo },
    messages: conversation.messages.map(message => ({ ...message }))
});

const insertUserStatement = database.prepare(`
    INSERT INTO users (user_id, display_name, external_id, email, organization, department, roles_json)
    VALUES (@userId, @displayName, @externalId, @email, @organization, @department, @rolesJson)
    ON CONFLICT(user_id) DO UPDATE SET
        display_name = excluded.display_name,
        external_id = excluded.external_id,
        email = excluded.email,
        organization = excluded.organization,
        department = excluded.department,
        roles_json = excluded.roles_json
`);

const insertProfileStatement = database.prepare(`
    INSERT INTO profiles (user_id, avatar_json, character_system_prompt, preferences_json, prompt_overrides_json, updated_at)
    VALUES (@userId, @avatarJson, @characterSystemPrompt, @preferencesJson, @promptOverridesJson, @updatedAt)
    ON CONFLICT(user_id) DO UPDATE SET
        avatar_json = excluded.avatar_json,
        character_system_prompt = excluded.character_system_prompt,
        preferences_json = excluded.preferences_json,
        prompt_overrides_json = excluded.prompt_overrides_json,
        updated_at = excluded.updated_at
`);

    const insertCharacterStatement = database.prepare(`
        INSERT INTO characters (agent_id, definition_json, updated_at)
        VALUES (@agentId, @definitionJson, @updatedAt)
        ON CONFLICT(agent_id) DO UPDATE SET
        definition_json = excluded.definition_json,
        updated_at = excluded.updated_at
    `);

const insertSessionStatement = database.prepare(`
    INSERT INTO sessions (session_id, user_id, client_type, started_at, expires_at)
    VALUES (@sessionId, @userId, @clientType, @startedAt, @expiresAt)
    ON CONFLICT(session_id) DO UPDATE SET
        user_id = excluded.user_id,
        client_type = excluded.client_type,
        started_at = excluded.started_at,
        expires_at = excluded.expires_at
`);

const insertExternalIdentityStatement = database.prepare(`
    INSERT INTO external_identity_index (external_key, user_id)
    VALUES (?, ?)
    ON CONFLICT(external_key) DO UPDATE SET user_id = excluded.user_id
`);

const insertActivityStatement = database.prepare(`
    INSERT INTO activities (activity_id, user_id, session_id, type, actor_id, target_id, payload_json, created_at)
    VALUES (@activityId, @userId, @sessionId, @type, @actorId, @targetId, @payloadJson, @createdAt)
    ON CONFLICT(activity_id) DO UPDATE SET
        user_id = excluded.user_id,
        session_id = excluded.session_id,
        type = excluded.type,
        actor_id = excluded.actor_id,
        target_id = excluded.target_id,
        payload_json = excluded.payload_json,
        created_at = excluded.created_at
`);

const insertConversationStatement = database.prepare(`
    INSERT INTO conversations (
        conversation_key,
        conversation_id,
        participant_one_id,
        participant_one_type,
        participant_one_display_name,
        participant_two_id,
        participant_two_type,
        participant_two_display_name,
        user_id,
        agent_id,
        session_id,
        updated_at,
        messages_json
    )
    VALUES (
        @conversationKey,
        @conversationId,
        @participantOneId,
        @participantOneType,
        @participantOneDisplayName,
        @participantTwoId,
        @participantTwoType,
        @participantTwoDisplayName,
        @legacyUserId,
        @legacyAgentId,
        @sessionId,
        @updatedAt,
        @messagesJson
    )
    ON CONFLICT(conversation_key) DO UPDATE SET
        conversation_id = excluded.conversation_id,
        participant_one_id = excluded.participant_one_id,
        participant_one_type = excluded.participant_one_type,
        participant_one_display_name = excluded.participant_one_display_name,
        participant_two_id = excluded.participant_two_id,
        participant_two_type = excluded.participant_two_type,
        participant_two_display_name = excluded.participant_two_display_name,
        user_id = excluded.user_id,
        agent_id = excluded.agent_id,
        session_id = excluded.session_id,
        updated_at = excluded.updated_at,
        messages_json = excluded.messages_json
`);

const migrateLegacyJsonState = database.transaction((legacyState: PersistedState) => {
    Object.values(legacyState.usersById).forEach(user => {
        insertUserStatement.run({
            userId: user.userId,
            displayName: user.displayName,
            externalId: user.externalId ?? null,
            email: user.email ?? null,
            organization: user.organization ?? null,
            department: user.department ?? null,
            rolesJson: serialize(user.roles)
        });
    });

    Object.values(legacyState.profilesByUserId).forEach(profile => {
        const legacyPromptOverrides = (profile as UserProfile & { promptOverrides?: Record<string, string> }).promptOverrides ?? {};
        insertProfileStatement.run({
            userId: profile.userId,
            avatarJson: profile.avatar ? serialize(profile.avatar) : null,
            characterSystemPrompt: profile.characterSystemPrompt ?? null,
            preferencesJson: serialize(profile.preferences),
            promptOverridesJson: serialize(legacyPromptOverrides),
            updatedAt: profile.updatedAt
        });
    });

    Object.values(legacyState.charactersById).forEach(character => {
        insertCharacterStatement.run({
            agentId: character.agentId,
            definitionJson: serialize(character),
            updatedAt: character.updatedAt ?? new Date(0).toISOString()
        });
    });

    Object.values(legacyState.sessionsById).forEach(session => {
        insertSessionStatement.run({
            sessionId: session.sessionId,
            userId: session.userId,
            clientType: session.clientType,
            startedAt: session.startedAt,
            expiresAt: session.expiresAt ?? null
        });
    });

    Object.entries(legacyState.externalIdentityIndex).forEach(([externalKey, userId]) => {
        insertExternalIdentityStatement.run(externalKey, userId);
    });

    legacyState.activityLog.forEach(activity => {
        insertActivityStatement.run({
            activityId: activity.activityId,
            userId: activity.userId,
            sessionId: activity.sessionId,
            type: activity.type,
            actorId: activity.actorId,
            targetId: activity.targetId ?? null,
            payloadJson: serialize(activity.payload),
            createdAt: activity.createdAt
        });
    });

    Object.entries(legacyState.conversationsByKey).forEach(([conversationKey, conversation]) => {
        insertConversationStatement.run({
            conversationKey,
            conversationId: conversation.conversationId,
            participantOneId: conversation.participantOne.participantId,
            participantOneType: conversation.participantOne.participantType,
            participantOneDisplayName: conversation.participantOne.displayName ?? null,
            participantTwoId: conversation.participantTwo.participantId,
            participantTwoType: conversation.participantTwo.participantType,
            participantTwoDisplayName: conversation.participantTwo.displayName ?? null,
            legacyUserId: conversation.participantOne.participantType === "user" ? conversation.participantOne.participantId : conversation.participantTwo.participantId,
            legacyAgentId: conversation.participantOne.participantType === "agent" ? conversation.participantOne.participantId : conversation.participantTwo.participantId,
            sessionId: conversation.lastSessionId ?? null,
            updatedAt: conversation.updatedAt,
            messagesJson: serialize(conversation.messages)
        });
    });
});

if (isDatabaseEmpty()) {
    const legacyState = loadLegacyJsonState();
    const hasLegacyData = Object.keys(legacyState.usersById).length > 0
        || Object.keys(legacyState.profilesByUserId).length > 0
        || Object.keys(legacyState.charactersById).length > 0
        || Object.keys(legacyState.sessionsById).length > 0
        || Object.keys(legacyState.externalIdentityIndex).length > 0
        || legacyState.activityLog.length > 0
        || Object.keys(legacyState.conversationsByKey).length > 0;

    if (hasLegacyData) {
        migrateLegacyJsonState(legacyState);
    }
}

export const getStateFilePath = (): string => stateFilePath;

export const getUserRecord = (userId: string): DepartmentUser | undefined => {
    const row = database.prepare(`
        SELECT user_id AS userId, display_name AS displayName, external_id AS externalId, email, organization, department, roles_json AS rolesJson
        FROM users
        WHERE user_id = ?
    `).get(userId) as {
        userId: string;
        displayName: string;
        externalId: string | null;
        email: string | null;
        organization: string | null;
        department: string | null;
        rolesJson: string;
    } | undefined;

    if (!row) {
        return undefined;
    }

    return {
        userId: row.userId,
        displayName: row.displayName,
        externalId: row.externalId ?? undefined,
        email: row.email ?? undefined,
        organization: row.organization ?? undefined,
        department: row.department ?? undefined,
        roles: parseJsonObject<string[]>(row.rolesJson, [])
    };
};

export const listUserRecords = (): DepartmentUser[] => {
    const rows = database.prepare(`
        SELECT user_id AS userId, display_name AS displayName, external_id AS externalId, email, organization, department, roles_json AS rolesJson
        FROM users
        ORDER BY display_name COLLATE NOCASE ASC, user_id ASC
    `).all() as Array<{
        userId: string;
        displayName: string;
        externalId: string | null;
        email: string | null;
        organization: string | null;
        department: string | null;
        rolesJson: string;
    }>;

    return rows.map(row => ({
        userId: row.userId,
        displayName: row.displayName,
        externalId: row.externalId ?? undefined,
        email: row.email ?? undefined,
        organization: row.organization ?? undefined,
        department: row.department ?? undefined,
        roles: parseJsonObject<string[]>(row.rolesJson, [])
    }));
};

export const setUserRecord = (user: DepartmentUser): DepartmentUser => {
    insertUserStatement.run({
        userId: user.userId,
        displayName: user.displayName,
        externalId: user.externalId ?? null,
        email: user.email ?? null,
        organization: user.organization ?? null,
        department: user.department ?? null,
        rolesJson: serialize(user.roles)
    });
    return {
        ...user,
        roles: [...user.roles]
    };
};

export const getProfileRecord = (userId: string): UserProfile | undefined => {
    const row = database.prepare(`
        SELECT user_id AS userId, avatar_json AS avatarJson, character_system_prompt AS characterSystemPrompt, preferences_json AS preferencesJson, prompt_overrides_json AS promptOverridesJson, updated_at AS updatedAt
        FROM profiles
        WHERE user_id = ?
    `).get(userId) as {
        userId: string;
        avatarJson: string | null;
        characterSystemPrompt: string | null;
        preferencesJson: string;
        promptOverridesJson: string;
        updatedAt: string;
    } | undefined;

    if (!row) {
        return undefined;
    }

    return {
        userId: row.userId,
        avatar: parseJsonObject<UserProfile["avatar"] | undefined>(row.avatarJson, undefined),
        characterSystemPrompt: row.characterSystemPrompt ?? undefined,
        preferences: parseJsonObject<Record<string, unknown>>(row.preferencesJson, {}),
        updatedAt: row.updatedAt
    };
};

export const setProfileRecord = (profile: UserProfile): UserProfile => {
    insertProfileStatement.run({
        userId: profile.userId,
        avatarJson: profile.avatar ? serialize(profile.avatar) : null,
        characterSystemPrompt: profile.characterSystemPrompt ?? null,
        preferencesJson: serialize(profile.preferences),
        promptOverridesJson: serialize({}),
        updatedAt: profile.updatedAt
    });
    return {
        ...profile,
        avatar: profile.avatar ? { ...profile.avatar } : undefined,
        characterSystemPrompt: profile.characterSystemPrompt,
        preferences: { ...profile.preferences }
    };
};

export const getCharacterRecord = (agentId: string): AgentDefinition | undefined => {
    const row = database.prepare(`
        SELECT definition_json AS definitionJson
        FROM characters
        WHERE agent_id = ?
    `).get(agentId) as {
        definitionJson: string;
    } | undefined;

    if (!row) {
        return undefined;
    }

    const definition = parseJsonObject<AgentDefinition | null>(row.definitionJson, null);
    return definition ? cloneAgentDefinition(definition) : undefined;
};

export const listCharacterRecords = (): AgentDefinition[] => {
    const rows = database.prepare(`
        SELECT definition_json AS definitionJson
        FROM characters
        ORDER BY agent_id ASC
    `).all() as Array<{ definitionJson: string }>;

    return rows
        .map(row => parseJsonObject<AgentDefinition | null>(row.definitionJson, null))
        .filter((definition): definition is AgentDefinition => !!definition)
        .map(definition => cloneAgentDefinition(definition));
};

export const setCharacterRecord = (character: AgentDefinition): AgentDefinition => {
    const stored = cloneAgentDefinition(character);
    insertCharacterStatement.run({
        agentId: stored.agentId,
        definitionJson: serialize(stored),
        updatedAt: stored.updatedAt ?? new Date().toISOString()
    });
    return cloneAgentDefinition(stored);
};

export const getSessionRecord = (sessionId: string): AppSession | undefined => {
    const row = database.prepare(`
        SELECT session_id AS sessionId, user_id AS userId, client_type AS clientType, started_at AS startedAt, expires_at AS expiresAt
        FROM sessions
        WHERE session_id = ?
    `).get(sessionId) as {
        sessionId: string;
        userId: string;
        clientType: AppSession["clientType"];
        startedAt: string;
        expiresAt: string | null;
    } | undefined;

    return row
        ? {
            sessionId: row.sessionId,
            userId: row.userId,
            clientType: row.clientType,
            startedAt: row.startedAt,
            expiresAt: row.expiresAt ?? undefined
        }
        : undefined;
};

export const setSessionRecord = (session: AppSession): AppSession => {
    insertSessionStatement.run({
        sessionId: session.sessionId,
        userId: session.userId,
        clientType: session.clientType,
        startedAt: session.startedAt,
        expiresAt: session.expiresAt ?? null
    });
    return { ...session };
};

export const deleteSessionRecord = (sessionId: string): void => {
    database.prepare(`DELETE FROM sessions WHERE session_id = ?`).run(sessionId);
};

export const getExternalIdentityUserId = (externalKey: string): string | undefined => {
    const row = database.prepare(`SELECT user_id AS userId FROM external_identity_index WHERE external_key = ?`).get(externalKey) as { userId: string } | undefined;
    return row?.userId;
};

export const setExternalIdentityUserId = (externalKey: string, userId: string): void => {
    insertExternalIdentityStatement.run(externalKey, userId);
};

export const appendActivityRecord = (activity: ActivityEvent): ActivityEvent => {
    insertActivityStatement.run({
        activityId: activity.activityId,
        userId: activity.userId,
        sessionId: activity.sessionId,
        type: activity.type,
        actorId: activity.actorId,
        targetId: activity.targetId ?? null,
        payloadJson: serialize(activity.payload),
        createdAt: activity.createdAt
    });
    return {
        ...activity,
        payload: { ...activity.payload }
    };
};

export const listActivityRecords = (): ActivityEvent[] => {
    const rows = database.prepare(`
        SELECT activity_id AS activityId, user_id AS userId, session_id AS sessionId, type, actor_id AS actorId, target_id AS targetId, payload_json AS payloadJson, created_at AS createdAt
        FROM activities
        ORDER BY created_at ASC, activity_id ASC
    `).all() as Array<{
        activityId: string;
        userId: string;
        sessionId: string;
        type: ActivityEvent["type"];
        actorId: string;
        targetId: string | null;
        payloadJson: string;
        createdAt: string;
    }>;

    return rows.map(row => ({
        activityId: row.activityId,
        userId: row.userId,
        sessionId: row.sessionId,
        type: row.type,
        actorId: row.actorId,
        targetId: row.targetId ?? undefined,
        payload: parseJsonObject<Record<string, unknown>>(row.payloadJson, {}),
        createdAt: row.createdAt
    }));
};

export const getConversationRecord = (key: string): StoredConversationRecord | undefined => {
    const row = database.prepare(`
        SELECT
            conversation_id AS conversationId,
            participant_one_id AS participantOneId,
            participant_one_type AS participantOneType,
            participant_one_display_name AS participantOneDisplayName,
            participant_two_id AS participantTwoId,
            participant_two_type AS participantTwoType,
            participant_two_display_name AS participantTwoDisplayName,
            user_id AS legacyUserId,
            agent_id AS legacyAgentId,
            session_id AS sessionId,
            updated_at AS updatedAt,
            messages_json AS messagesJson
        FROM conversations
        WHERE conversation_key = ?
    `).get(key) as {
        conversationId: string;
        participantOneId: string | null;
        participantOneType: ConversationParticipantRef["participantType"] | null;
        participantOneDisplayName: string | null;
        participantTwoId: string | null;
        participantTwoType: ConversationParticipantRef["participantType"] | null;
        participantTwoDisplayName: string | null;
        legacyUserId: string | null;
        legacyAgentId: string | null;
        sessionId: string | null;
        updatedAt: string | null;
        messagesJson: string;
    } | undefined;

    if (!row) {
        return undefined;
    }

    const legacyMessages = parseJsonObject<ConversationMessage[]>(row.messagesJson, []);
    const fallbackParticipantOne: ConversationParticipantRef = {
        participantId: row.participantOneId ?? row.legacyUserId ?? key.split("|")[0]?.split(":").slice(1).join(":") ?? "unknown",
        participantType: row.participantOneType ?? (row.legacyUserId ? "user" : "user"),
        displayName: row.participantOneDisplayName ?? undefined
    };
    const fallbackParticipantTwo: ConversationParticipantRef = {
        participantId: row.participantTwoId ?? row.legacyAgentId ?? key.split("|")[1]?.split(":").slice(1).join(":") ?? "unknown",
        participantType: row.participantTwoType ?? (row.legacyAgentId ? "agent" : "agent"),
        displayName: row.participantTwoDisplayName ?? undefined
    };

    return {
        conversationId: row.conversationId,
        participantOne: fallbackParticipantOne,
        participantTwo: fallbackParticipantTwo,
        lastSessionId: row.sessionId ?? undefined,
        updatedAt: row.updatedAt ?? legacyMessages.at(-1)?.createdAt ?? new Date(0).toISOString(),
        messages: legacyMessages.map(message => ({ ...message }))
    };
};

export const setConversationRecord = (key: string, conversation: StoredConversationRecord): StoredConversationRecord => {
    const storedConversation = cloneConversation(conversation);
    insertConversationStatement.run({
        conversationKey: key,
        conversationId: storedConversation.conversationId,
        participantOneId: storedConversation.participantOne.participantId,
        participantOneType: storedConversation.participantOne.participantType,
        participantOneDisplayName: storedConversation.participantOne.displayName ?? null,
        participantTwoId: storedConversation.participantTwo.participantId,
        participantTwoType: storedConversation.participantTwo.participantType,
        participantTwoDisplayName: storedConversation.participantTwo.displayName ?? null,
        legacyUserId: storedConversation.participantOne.participantType === "user" ? storedConversation.participantOne.participantId : storedConversation.participantTwo.participantId,
        legacyAgentId: storedConversation.participantOne.participantType === "agent" ? storedConversation.participantOne.participantId : storedConversation.participantTwo.participantId,
        sessionId: storedConversation.lastSessionId ?? null,
        updatedAt: storedConversation.updatedAt,
        messagesJson: serialize(storedConversation.messages)
    });
    return cloneConversation(storedConversation);
};

export const replaceStateForTests = (nextState: PersistedState): void => {
    const sanitized = sanitizeState(nextState);
    const reset = database.transaction(() => {
        database.exec(`
            DELETE FROM conversations;
            DELETE FROM activities;
            DELETE FROM external_identity_index;
            DELETE FROM sessions;
            DELETE FROM characters;
            DELETE FROM profiles;
            DELETE FROM users;
        `);
        migrateLegacyJsonState(sanitized);
    });
    reset();
};