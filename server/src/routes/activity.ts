import type { IncomingMessage, ServerResponse } from "http";
import type { ActivityType } from "../../../shared/types";
import { getSessionIdFromRequest } from "../auth/session";
import { parseJsonBody } from "../http/body";
import { sendJson } from "../http/response";
import { appendMockActivity, listActivitiesForUser } from "../storage/memory/activityStore";
import { getSessionContext } from "../storage/memory/bootstrapStore";

const VALID_ACTIVITY_TYPES = new Set<ActivityType>([
    "player_chat_sent",
    "player_chat_received",
    "agent_chat_sent",
    "agent_chat_received",
    "iframe_opened",
    "iframe_closed",
    "iframe_url_changed",
    "presentation_started",
    "presentation_viewed",
    "room_joined",
    "room_left",
    "avatar_updated",
    "character_prompt_updated"
]);

export const handleListActivitiesRoute = (request: IncomingMessage, requestUrl: URL, response: ServerResponse): void => {
    const sessionContext = getSessionContext(getSessionIdFromRequest(request));
    if (!sessionContext) {
        sendJson(request, response, 401, { error: "Authentication required" });
        return;
    }

    const limitParam = requestUrl.searchParams.get("limit");
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

    sendJson(request, response, 200, {
        activities: listActivitiesForUser(sessionContext.user.userId, limit)
    });
};

export const handleCreateActivityRoute = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const sessionContext = getSessionContext(getSessionIdFromRequest(request));
    if (!sessionContext) {
        sendJson(request, response, 401, { error: "Authentication required" });
        return;
    }

    try {
        const payload = await parseJsonBody<{
            type?: ActivityType;
            actorId?: string;
            targetId?: string;
            payload?: Record<string, unknown>;
        }>(request);

        if (!payload.type || !VALID_ACTIVITY_TYPES.has(payload.type)) {
            sendJson(request, response, 400, {
                error: "Invalid activity type"
            });
            return;
        }

        const activity = appendMockActivity({
            userId: sessionContext.user.userId,
            sessionId: sessionContext.session.sessionId,
            type: payload.type,
            actorId: payload.actorId,
            targetId: payload.targetId,
            payload: payload.payload
        });

        sendJson(request, response, 201, {
            activity
        });
    } catch (_) {
        sendJson(request, response, 400, {
            error: "Invalid JSON payload"
        });
    }
};