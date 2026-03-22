import type { ActivityEvent, ActivityType } from "../../../../shared/types";
import { appendActivityRecord, listActivityRecords } from "../stateStore";

const now = () => new Date().toISOString();

const createActivityId = (): string => {
    return `activity-${Date.now()}-${listActivityRecords().length + 1}`;
};

export interface CreateActivityInput {
    userId: string;
    sessionId: string;
    type: ActivityType;
    actorId?: string;
    targetId?: string;
    payload?: Record<string, unknown>;
}

export const appendMockActivity = (input: CreateActivityInput): ActivityEvent => {
    const activity: ActivityEvent = {
        activityId: createActivityId(),
        userId: input.userId,
        sessionId: input.sessionId,
        type: input.type,
        actorId: input.actorId ?? input.userId,
        targetId: input.targetId,
        payload: input.payload ?? {},
        createdAt: now()
    };

    return appendActivityRecord(activity);
};

export const listMockActivities = (limit?: number): ActivityEvent[] => {
    const activityLog = listActivityRecords();
    if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
        return activityLog.slice(-Math.floor(limit));
    }

    return [...activityLog];
};

export const listActivitiesForUser = (userId: string, limit?: number): ActivityEvent[] => {
    const activityLog = listActivityRecords();
    const events = activityLog.filter(activity => activity.userId === userId);
    if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
        return events.slice(-Math.floor(limit));
    }
    return events;
};

export const listRecentMockActivities = (limit: number): ActivityEvent[] => {
    return listMockActivities(limit);
};