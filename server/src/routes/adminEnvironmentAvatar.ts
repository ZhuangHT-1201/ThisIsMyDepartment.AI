import type { IncomingMessage, ServerResponse } from "http";
import type { AgentDefinition } from "../../../shared/types";
import { getSessionIdFromRequest } from "../auth/session";
import { parseJsonBody } from "../http/body";
import { sendJson } from "../http/response";
import { broadcastEnvironmentAvatarUpsert } from "../services/realtimeServer";
import { createBuiltInEnvironmentAvatarDefinition, getBuiltInEnvironmentAvatarDefinitions, getCharacterDefinitionById, getSessionContext, updateBuiltInEnvironmentAvatarDefinition } from "../storage/memory/bootstrapStore";

const requireAdminSession = (request: IncomingMessage, response: ServerResponse) => {
    const sessionContext = getSessionContext(getSessionIdFromRequest(request));
    if (!sessionContext) {
        sendJson(request, response, 401, { error: "Authentication required" });
        return null;
    }

    if (!sessionContext.user.roles.some(role => role.trim().toLowerCase() === "admin")) {
        sendJson(request, response, 403, { error: "Admin role required" });
        return null;
    }

    return sessionContext;
};

const normalizeCaption = (value: unknown): string | undefined => {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};

const normalizePrompt = (value: unknown): string => {
    if (typeof value !== "string") {
        return "";
    }
    return value.trim();
};

const parseFiniteNumber = (value: unknown): number | null => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }
    return value;
};

const normalizeRole = (value: unknown): AgentDefinition["characterRole"] => {
    if (value === "teacher" || value === "student" || value === "staff" || value === "custom") {
        return value;
    }
    return "custom";
};

const parsePosition = (value: unknown): { x: number; y: number } | null => {
    if (!value || typeof value !== "object") {
        return null;
    }
    const x = parseFiniteNumber((value as { x?: unknown }).x);
    const y = parseFiniteNumber((value as { y?: unknown }).y);
    if (x == null || y == null) {
        return null;
    }
    return { x, y };
};

const parseWalkArea = (value: unknown): AgentDefinition["walkArea"] | null => {
    if (value == null) {
        return undefined;
    }
    if (typeof value !== "object") {
        return null;
    }
    const x = parseFiniteNumber((value as { x?: unknown }).x);
    const y = parseFiniteNumber((value as { y?: unknown }).y);
    const width = parseFiniteNumber((value as { width?: unknown }).width);
    const height = parseFiniteNumber((value as { height?: unknown }).height);
    if (x == null || y == null || width == null || height == null || width < 0 || height < 0) {
        return null;
    }
    return width === 0 || height === 0
        ? undefined
        : { x, y, width, height };
};

const buildValidatedCharacterUpdate = (base: AgentDefinition, payload: Record<string, unknown>): AgentDefinition | null => {
    const displayName = typeof payload.displayName === "string" ? payload.displayName.trim() : "";
    const spriteIndex = payload.spriteIndex;
    const spawnByDefault = payload.spawnByDefault;

    if (!displayName) {
        return null;
    }
    if (typeof spriteIndex !== "number" || !Number.isInteger(spriteIndex) || spriteIndex < 0) {
        return null;
    }
    const position = parsePosition(payload.position);
    if (!position) {
        return null;
    }
    const walkArea = parseWalkArea(payload.walkArea);
    if (walkArea === null) {
        return null;
    }

    if (typeof spawnByDefault !== "boolean") {
        return null;
    }

    return {
        ...base,
        displayName,
        spriteIndex,
        caption: normalizeCaption(payload.caption),
        defaultSystemPrompt: normalizePrompt(payload.defaultSystemPrompt),
        position,
        walkArea,
        characterRole: normalizeRole(payload.characterRole),
        spawnByDefault
    };
};

const buildValidatedCharacterCreate = (payload: Record<string, unknown>): Partial<AgentDefinition> | null => {
    const displayName = typeof payload.displayName === "string" ? payload.displayName.trim() : "";
    const spriteIndex = payload.spriteIndex;
    if (!displayName) {
        return null;
    }
    if (typeof spriteIndex !== "number" || !Number.isInteger(spriteIndex) || spriteIndex < 0) {
        return null;
    }

    const position = parsePosition(payload.position);
    if (!position) {
        return null;
    }

    const walkArea = parseWalkArea(payload.walkArea);
    if (walkArea === null) {
        return null;
    }

    return {
        displayName,
        spriteIndex,
        caption: normalizeCaption(payload.caption),
        defaultSystemPrompt: normalizePrompt(payload.defaultSystemPrompt),
        position,
        walkArea,
        characterRole: normalizeRole(payload.characterRole),
        spawnByDefault: typeof payload.spawnByDefault === "boolean" ? payload.spawnByDefault : true
    };
};

export const handleListAdminEnvironmentAvatarsRoute = (request: IncomingMessage, response: ServerResponse): void => {
    if (!requireAdminSession(request, response)) {
        return;
    }

    sendJson(request, response, 200, {
        agents: getBuiltInEnvironmentAvatarDefinitions()
    });
};

export const handleCreateAdminEnvironmentAvatarRoute = async (
    request: IncomingMessage,
    response: ServerResponse
): Promise<void> => {
    if (!requireAdminSession(request, response)) {
        return;
    }

    try {
        const payload = await parseJsonBody<Record<string, unknown>>(request);
        const validated = buildValidatedCharacterCreate(payload);
        if (!validated) {
            sendJson(request, response, 400, { error: "Invalid environment avatar payload" });
            return;
        }

        const created = createBuiltInEnvironmentAvatarDefinition(validated);
        broadcastEnvironmentAvatarUpsert(created);
        sendJson(request, response, 201, { agent: created });
    } catch (_error) {
        sendJson(request, response, 400, { error: "Invalid JSON payload" });
    }
};

export const handleUpdateAdminEnvironmentAvatarRoute = async (
    request: IncomingMessage,
    response: ServerResponse,
    agentId: string
): Promise<void> => {
    if (!requireAdminSession(request, response)) {
        return;
    }

    try {
        const payload = await parseJsonBody<Record<string, unknown>>(request);
        const existing = getCharacterDefinitionById(agentId);
        if (!existing || existing.ownerUserId) {
            sendJson(request, response, 404, { error: "Unknown environment avatar" });
            return;
        }

        const updated = buildValidatedCharacterUpdate(existing, payload);
        if (!updated) {
            sendJson(request, response, 400, { error: "Invalid environment avatar update payload" });
            return;
        }

        const saved = updateBuiltInEnvironmentAvatarDefinition(updated);
        if (!saved) {
            sendJson(request, response, 400, { error: "Could not update environment avatar" });
            return;
        }

        broadcastEnvironmentAvatarUpsert(saved);
        sendJson(request, response, 200, { agent: saved });
    } catch (_error) {
        sendJson(request, response, 400, { error: "Invalid JSON payload" });
    }
};
