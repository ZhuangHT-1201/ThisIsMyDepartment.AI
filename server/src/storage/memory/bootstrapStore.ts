import type { AgentDefinition, AppSession, BootstrapResponse, ClientType, DepartmentUser, UserProfile, VerifiedIdentity } from "../../../../shared/types";
import { getServerConfig } from "../../config";
import { deleteSessionRecord, getCharacterRecord, getExternalIdentityUserId, getProfileRecord, getSessionRecord, getUserRecord, listCharacterRecords, listUserRecords, setCharacterRecord, setExternalIdentityUserId, setProfileRecord, setSessionRecord, setUserRecord } from "../stateStore";

const now = () => new Date().toISOString();

const serverConfig = getServerConfig();
const sessionTtlSeconds = serverConfig.sessionTtlSeconds;

const LEGACY_SEEDED_CHARACTER_NAMES: Record<string, string> = {
    "chuanhao-bot": "李传浩老师",
    "chenwang-bot": "王琛老师"
};

function buildConfiguredDefaultAgentRoute(): Pick<AgentDefinition, "provider" | "model"> {
    const explicitProvider = process.env.TIMD_AGENT_LLM_PROVIDER?.trim().toLowerCase();

    if (explicitProvider === "mock") {
        return {
            provider: "mock",
            model: process.env.MOCK_LLM_MODEL ?? "local-context-preview"
        };
    }

    if (explicitProvider === "openrouter") {
        return {
            provider: "openrouter",
            model: process.env.OPENROUTER_MODEL ?? "openai/gpt-4.1-mini"
        };
    }

    if (explicitProvider === "openai") {
        return {
            provider: "openai",
            model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini"
        };
    }

    if (process.env.OPENROUTER_API_KEY) {
        return {
            provider: "openrouter",
            model: process.env.OPENROUTER_MODEL ?? "openai/gpt-4.1-mini"
        };
    }

    if (process.env.OPENAI_API_KEY) {
        return {
            provider: "openai",
            model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini"
        };
    }

    return {
        provider: "mock",
        model: process.env.MOCK_LLM_MODEL ?? "local-context-preview"
    };
}

const buildTeacherSystemPrompt = (displayName: string, specialization: string): string => {
    return `You are ${displayName}, an AI department teacher avatar specializing in ${specialization}. Answer like an experienced instructor inside a university department. Be concise, helpful, and honest about uncertainty. Use the user's recent activity context when it is relevant.`;
};

const seededCharacters: AgentDefinition[] = [
    {
        agentId: "chuanhao-bot",
        displayName: "运筹学课程老师",
        spriteIndex: 4,
        position: { x: 548.67, y: 1085.67 },
        caption: "按E键聊天",
        defaultSystemPrompt: buildTeacherSystemPrompt("运筹学课程老师", "operations research and analytical problem solving"),
        ...buildConfiguredDefaultAgentRoute(),
        walkArea: { x: 548.67, y: 1085.67, width: 50, height: 50 },
        characterRole: "teacher",
        spawnByDefault: true
    },
    {
        agentId: "chenwang-bot",
        displayName: "工业工程实践课程老师",
        spriteIndex: 3,
        position: { x: 129.67, y: 1092.67 },
        caption: "按E键聊天",
        defaultSystemPrompt: buildTeacherSystemPrompt("工业工程实践课程老师", "industrial engineering practice, project work, and applied methods"),
        ...buildConfiguredDefaultAgentRoute(),
        walkArea: { x: 129.67, y: 1092.67, width: 50, height: 50 },
        characterRole: "teacher",
        spawnByDefault: true
    }
];

const cloneCharacterDefinition = (definition: AgentDefinition): AgentDefinition => ({
    ...definition,
    position: { ...definition.position },
    walkArea: definition.walkArea ? { ...definition.walkArea } : undefined
});

const ensureSeededCharacters = (): AgentDefinition[] => {
    const persistedCharacters = listCharacterRecords();
    const persistedById = new Map(persistedCharacters.map(character => [character.agentId, character]));

    seededCharacters.forEach(character => {
        const persistedCharacter = persistedById.get(character.agentId);
        if (!persistedCharacter) {
            setCharacterRecord({
                ...cloneCharacterDefinition(character),
                updatedAt: now()
            });
            return;
        }

        const shouldCanonicalizeDeploymentCharacter = !persistedCharacter.ownerUserId;

        if (shouldCanonicalizeDeploymentCharacter) {
            setCharacterRecord({
                ...cloneCharacterDefinition(character),
                updatedAt: persistedCharacter.updatedAt ?? now()
            });
        }
    });

    const characters = listCharacterRecords();
    return (characters.length > 0 ? characters : seededCharacters).map(cloneCharacterDefinition);
};

export const getMockBootstrapResponse = (): BootstrapResponse => ({
    authenticated: false,
    user: null,
    profile: null,
    session: null,
    agents: ensureSeededCharacters(),
    room: {
        roomId: serverConfig.defaultRoomId,
        displayName: serverConfig.defaultRoomDisplayName
    },
    loginUrl: "/auth/login"
});

const createExternalIdentityKey = (externalProvider: string, externalId: string): string => {
    return `${externalProvider.toLowerCase()}:${externalId.toLowerCase()}`;
};

const normalizeIdPart = (value: string): string => {
    const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return normalized || "user";
};

const createStableUserId = (identity: VerifiedIdentity): string => {
    return `user-${normalizeIdPart(identity.externalProvider)}-${normalizeIdPart(identity.externalId)}`;
};

const createSessionId = (userId: string): string => {
    return `session-${userId}-${Date.now()}`;
};

const getProfileByUserId = (userId: string): UserProfile => {
    const existingProfile = getProfileRecord(userId);
    if (existingProfile) {
        return existingProfile;
    }

    const createdProfile: UserProfile = {
        userId,
        characterSystemPrompt: "",
        preferences: {},
        updatedAt: now()
    };
    return setProfileRecord(createdProfile);
};

const createUserAvatarAgentId = (userId: string): string => `user-avatar-${userId}`;

const buildUserAvatarSystemPrompt = (user: DepartmentUser, profile: UserProfile): string => {
    const customPrompt = profile.characterSystemPrompt?.trim();
    if (customPrompt) {
        return customPrompt;
    }

    const identitySummary = [
        user.organization ? `Organization: ${user.organization}.` : "",
        user.department ? `Department: ${user.department}.` : "",
        user.roles.length > 0 ? `Roles: ${user.roles.join(", ")}.` : ""
    ].filter(Boolean).join(" ");

    return `You are the AI representation of ${user.displayName}. Speak in first person as this department member. Use prior activity context when available, stay grounded in known facts, and explicitly say when you do not know something. ${identitySummary}`.trim();
};

const buildConfiguredAvatarModelRoute = (): Pick<AgentDefinition, "provider" | "model"> => buildConfiguredDefaultAgentRoute();

const buildUserAvatarAgentDefinition = (user: DepartmentUser, profile: UserProfile, position: { x: number; y: number }): AgentDefinition => ({
    agentId: createUserAvatarAgentId(user.userId),
    displayName: user.displayName,
    spriteIndex: profile.avatar?.spriteIndex ?? 0,
    position: { ...position },
    caption: "Press E to chat",
    defaultSystemPrompt: buildUserAvatarSystemPrompt(user, profile),
    ...buildConfiguredAvatarModelRoute(),
    characterRole: "custom",
    ownerUserId: user.userId,
    spawnByDefault: false,
    updatedAt: now()
});

const hydrateAvatarAgentDefinition = (definition: AgentDefinition): AgentDefinition => {
    if (!definition.ownerUserId) {
        return cloneCharacterDefinition(definition);
    }

    const user = getUserRecord(definition.ownerUserId);
    if (!user) {
        return cloneCharacterDefinition(definition);
    }

    const profile = getProfileByUserId(user.userId);
    return {
        ...buildUserAvatarAgentDefinition(user, profile, definition.position),
        agentId: definition.agentId,
        position: { ...definition.position },
        walkArea: definition.walkArea ? { ...definition.walkArea } : undefined,
        updatedAt: definition.updatedAt ?? now()
    };
};

const buildSessionExpiry = (): string => {
    return new Date(Date.now() + sessionTtlSeconds * 1000).toISOString();
};

const getUserByIdentity = (identity: VerifiedIdentity): DepartmentUser => {
    const externalKey = createExternalIdentityKey(identity.externalProvider, identity.externalId);
    const existingUserId = getExternalIdentityUserId(externalKey);
    if (existingUserId) {
        const existingUser = getUserRecord(existingUserId);
        if (existingUser) {
            const updatedUser: DepartmentUser = {
                ...existingUser,
                displayName: identity.displayName,
                externalId: identity.externalId,
                email: identity.email,
                organization: identity.organization,
                department: identity.department,
                roles: identity.roles ?? existingUser.roles
            };
            return setUserRecord(updatedUser);
        }
    }

    const userId = createStableUserId(identity);
    const createdUser: DepartmentUser = {
        userId,
        displayName: identity.displayName,
        externalId: identity.externalId,
        email: identity.email,
        organization: identity.organization,
        department: identity.department,
        roles: identity.roles ?? []
    };
    setExternalIdentityUserId(externalKey, userId);
    return setUserRecord(createdUser);
};

export interface SessionContext {
    user: DepartmentUser;
    profile: UserProfile;
    session: AppSession;
}

export const createSessionForVerifiedIdentity = (identity: VerifiedIdentity, clientType: ClientType): SessionContext => {
    const user = getUserByIdentity(identity);
    const profile = getProfileByUserId(user.userId);
    const session: AppSession = {
        sessionId: createSessionId(user.userId),
        userId: user.userId,
        clientType,
        startedAt: now(),
        expiresAt: buildSessionExpiry()
    };
    setSessionRecord(session);

    return { user, profile, session };
};

export const getSessionContext = (sessionId: string | null | undefined): SessionContext | null => {
    if (!sessionId) {
        return null;
    }

    const session = getSessionRecord(sessionId);
    if (!session) {
        return null;
    }

    if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
        deleteSessionRecord(session.sessionId);
        return null;
    }

    const user = getUserRecord(session.userId);
    if (!user) {
        return null;
    }

    const profile = getProfileByUserId(user.userId);
    return { user, profile, session };
};

export const destroySession = (sessionId: string | null | undefined): void => {
    if (!sessionId) {
        return;
    }
    deleteSessionRecord(sessionId);
};

export const buildBootstrapResponseForSession = (sessionContext: SessionContext | null): BootstrapResponse => ({
    authenticated: !!sessionContext,
    user: sessionContext?.user ?? null,
    profile: sessionContext?.profile ?? null,
    session: sessionContext?.session ?? null,
    agents: getCharacterDefinitions(),
    room: {
        roomId: serverConfig.defaultRoomId,
        displayName: serverConfig.defaultRoomDisplayName
    },
    loginUrl: "/auth/login"
});

export const getCurrentProfileForUser = (userId: string): UserProfile => getProfileByUserId(userId);

export const getCurrentUserById = (userId: string): DepartmentUser | null => getUserRecord(userId) ?? null;

export const listCurrentUsers = (): DepartmentUser[] => listUserRecords();

export const getCurrentSessionById = (sessionId: string): AppSession | null => getSessionRecord(sessionId) ?? null;

export const getCharacterDefinitions = (): AgentDefinition[] => ensureSeededCharacters()
    .filter(definition => !definition.ownerUserId)
    .map(definition => cloneCharacterDefinition(definition));

export const getCharacterDefinitionById = (agentId: string): AgentDefinition | undefined => {
    ensureSeededCharacters();
    const record = getCharacterRecord(agentId);
    return record ? hydrateAvatarAgentDefinition(record) : undefined;
};

export const updateAvatarProfileForUser = (userId: string, spriteIndex: number): UserProfile => {
    const currentProfile = getProfileByUserId(userId);
    const updatedProfile: UserProfile = {
        ...currentProfile,
        avatar: {
            spriteIndex,
            updatedAt: now()
        },
        updatedAt: now()
    };
    return setProfileRecord(updatedProfile);
};

export const updateCharacterSystemPromptForUser = (userId: string, prompt: string): UserProfile => {
    const currentProfile = getProfileByUserId(userId);
    const updatedProfile: UserProfile = {
        ...currentProfile,
        characterSystemPrompt: prompt,
        updatedAt: now()
    };
    return setProfileRecord(updatedProfile);
};

export const updatePreferencesForUser = (userId: string, preferences: Record<string, unknown>): UserProfile => {
    const currentProfile = getProfileByUserId(userId);
    const updatedProfile: UserProfile = {
        ...currentProfile,
        preferences: {
            ...currentProfile.preferences,
            ...preferences
        },
        updatedAt: now()
    };
    return setProfileRecord(updatedProfile);
};

export const createOrUpdateAvatarAgentForUser = (userId: string, position: { x: number; y: number }): AgentDefinition | null => {
    const user = getUserRecord(userId);
    if (!user) {
        return null;
    }

    const profile = getProfileByUserId(userId);
    const definition = buildUserAvatarAgentDefinition(user, profile, position);
    return setCharacterRecord(definition);
};