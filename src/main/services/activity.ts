import { getBackendEndpointCandidates } from "../runtimeConfig";

export type ActivityLogType =
    | "player_chat_sent"
    | "player_chat_received"
    | "agent_chat_sent"
    | "agent_chat_received"
    | "iframe_opened"
    | "iframe_closed"
    | "iframe_url_changed"
    | "presentation_started"
    | "presentation_viewed"
    | "room_joined"
    | "room_left"
    | "avatar_updated"
    | "character_prompt_updated";

export interface ActivityLogRequest {
    type: ActivityLogType;
    actorId?: string;
    targetId?: string;
    payload?: Record<string, unknown>;
}

export interface StoredActivityEvent {
    activityId: string;
    userId: string;
    sessionId: string;
    type: ActivityLogType;
    actorId: string;
    targetId?: string;
    payload: Record<string, unknown>;
    createdAt: string;
}

export interface ActivitySummary {
    playerChats: number;
    agentChats: number;
    appUsageMinutes: number;
}

const getActivityCandidates = (): string[] => {
    return getBackendEndpointCandidates("/api/activities");
};

export const logActivity = async (request: ActivityLogRequest): Promise<void> => {
    const candidates = getActivityCandidates();

    for (const endpoint of candidates) {
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(request)
            });

            if (response.ok) {
                return;
            }
        } catch (error) {
            console.warn(`Activity request failed for ${endpoint}`, error);
        }
    }
};

const parseTimestamp = (value: string): number | null => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
};

export const computeActivitySummary = (activities: StoredActivityEvent[], nowMs = Date.now()): ActivitySummary => {
    const sortedActivities = [...activities].sort((left, right) => {
        const leftTime = parseTimestamp(left.createdAt) ?? 0;
        const rightTime = parseTimestamp(right.createdAt) ?? 0;
        return leftTime - rightTime;
    });

    let playerChats = 0;
    let agentChats = 0;
    let totalIFrameUsageMs = 0;
    let activeIFrameOpenedAt: number | null = null;

    sortedActivities.forEach(activity => {
        const timestamp = parseTimestamp(activity.createdAt);
        if (timestamp == null) {
            return;
        }

        switch (activity.type) {
            case "player_chat_sent":
            case "player_chat_received":
                playerChats += 1;
                break;
            case "agent_chat_sent":
            case "agent_chat_received":
                agentChats += 1;
                break;
            case "iframe_opened":
                if (activeIFrameOpenedAt != null && timestamp >= activeIFrameOpenedAt) {
                    totalIFrameUsageMs += timestamp - activeIFrameOpenedAt;
                }
                activeIFrameOpenedAt = timestamp;
                break;
            case "iframe_closed":
                if (activeIFrameOpenedAt != null && timestamp >= activeIFrameOpenedAt) {
                    totalIFrameUsageMs += timestamp - activeIFrameOpenedAt;
                    activeIFrameOpenedAt = null;
                }
                break;
            default:
                break;
        }
    });

    if (activeIFrameOpenedAt != null && nowMs >= activeIFrameOpenedAt) {
        totalIFrameUsageMs += nowMs - activeIFrameOpenedAt;
    }

    return {
        playerChats,
        agentChats,
        appUsageMinutes: totalIFrameUsageMs / 60000
    };
};

export const fetchActivitySummary = async (): Promise<ActivitySummary> => {
    const candidates = getActivityCandidates();

    for (const endpoint of candidates) {
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

            const result = await response.json() as { activities?: StoredActivityEvent[] };
            return computeActivitySummary(Array.isArray(result.activities) ? result.activities : []);
        } catch (error) {
            console.warn(`Activity summary request failed for ${endpoint}`, error);
        }
    }

    return {
        playerChats: 0,
        agentChats: 0,
        appUsageMinutes: 0
    };
};