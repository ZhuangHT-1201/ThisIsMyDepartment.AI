import type { IncomingMessage, ServerResponse } from "http";
import { appendMockActivity } from "../storage/memory/activityStore";
import { getSessionIdFromRequest } from "../auth/session";
import { parseJsonBody } from "../http/body";
import { sendJson } from "../http/response";
import { getSessionContext, updateAvatarProfileForUser, updateCharacterSystemPromptForUser } from "../storage/memory/bootstrapStore";

export const handleGetCurrentUserRoute = (request: IncomingMessage, response: ServerResponse): void => {
    const sessionContext = getSessionContext(getSessionIdFromRequest(request));
    if (!sessionContext) {
        sendJson(request, response, 401, { error: "Authentication required" });
        return;
    }

    sendJson(request, response, 200, {
        user: sessionContext.user,
        profile: sessionContext.profile
    });
};

export const handleUpdateProfileRoute = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const sessionContext = getSessionContext(getSessionIdFromRequest(request));
    if (!sessionContext) {
        sendJson(request, response, 401, { error: "Authentication required" });
        return;
    }

    try {
        const payload = await parseJsonBody<{
            avatar?: { spriteIndex?: number };
            characterSystemPrompt?: string;
        }>(request);
        const spriteIndex = payload.avatar?.spriteIndex;
        const hasAvatarUpdate = payload.avatar != null;
        const hasCharacterPromptUpdate = typeof payload.characterSystemPrompt === "string";

        if (!hasAvatarUpdate && !hasCharacterPromptUpdate) {
            sendJson(request, response, 400, {
                error: "Profile update requires avatar and/or characterSystemPrompt"
            });
            return;
        }

        if (hasAvatarUpdate && (typeof spriteIndex !== "number" || !Number.isInteger(spriteIndex) || spriteIndex < 0)) {
            sendJson(request, response, 400, {
                error: "Invalid avatar spriteIndex"
            });
            return;
        }

        let profile = sessionContext.profile;

        if (hasAvatarUpdate) {
            profile = updateAvatarProfileForUser(sessionContext.user.userId, spriteIndex!);
            appendMockActivity({
                userId: sessionContext.user.userId,
                sessionId: sessionContext.session.sessionId,
                type: "avatar_updated",
                actorId: sessionContext.user.userId,
                payload: {
                    spriteIndex
                }
            });
        }

        if (hasCharacterPromptUpdate) {
            profile = updateCharacterSystemPromptForUser(sessionContext.user.userId, payload.characterSystemPrompt ?? "");
            appendMockActivity({
                userId: sessionContext.user.userId,
                sessionId: sessionContext.session.sessionId,
                type: "character_prompt_updated",
                actorId: sessionContext.user.userId,
                payload: {
                    promptLength: (payload.characterSystemPrompt ?? "").trim().length,
                    hasPrompt: (payload.characterSystemPrompt ?? "").trim().length > 0
                }
            });
        }

        sendJson(request, response, 200, {
            user: sessionContext.user,
            profile
        });
    } catch (_) {
        sendJson(request, response, 400, {
            error: "Invalid JSON payload"
        });
    }
};