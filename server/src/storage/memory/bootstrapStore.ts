import type { AgentDefinition, AppSession, BootstrapResponse, ClientType, DepartmentUser, UserProfile, VerifiedIdentity } from "../../../../shared/types";
import { getServerConfig } from "../../config";
import { deleteSessionRecord, getCharacterRecord, getExternalIdentityUserId, getProfileRecord, getSessionRecord, getUserRecord, listCharacterRecords, setCharacterRecord, setExternalIdentityUserId, setProfileRecord, setSessionRecord, setUserRecord } from "../stateStore";

const now = () => new Date().toISOString();

const serverConfig = getServerConfig();
const sessionTtlSeconds = serverConfig.sessionTtlSeconds;

const LEGACY_SEEDED_CHARACTER_NAMES: Record<string, string> = {
    "chuanhao-bot": "李传浩老师",
    "chenwang-bot": "王琛老师"
};

const seededCharacters: AgentDefinition[] = [
    {
        agentId: "chuanhao-bot",
        displayName: "运筹学课程老师",
        spriteIndex: 4,
        position: { x: 548.67, y: 1085.67 },
        caption: "按E键聊天",
        defaultSystemPrompt: "You are a helpful department guide.",
        provider: "mock",
        model: "mock-guide-v1",
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
        defaultSystemPrompt: "You are a helpful department guide.",
        provider: "mock",
        model: "mock-guide-v1",
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

        const legacyDisplayName = LEGACY_SEEDED_CHARACTER_NAMES[character.agentId];
        const shouldCanonicalizeDeploymentCharacter = !persistedCharacter.ownerUserId
            && (!persistedCharacter.characterRole
                || persistedCharacter.displayName === legacyDisplayName);

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

export const getCurrentSessionById = (sessionId: string): AppSession | null => getSessionRecord(sessionId) ?? null;

export const getCharacterDefinitions = (): AgentDefinition[] => ensureSeededCharacters();

export const getCharacterDefinitionById = (agentId: string): AgentDefinition | undefined => {
    ensureSeededCharacters();
    const record = getCharacterRecord(agentId);
    return record ? cloneCharacterDefinition(record) : undefined;
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