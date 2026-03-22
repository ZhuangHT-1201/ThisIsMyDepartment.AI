export type ActivityType =
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

export interface ActivityEvent {
    activityId: string;
    userId: string;
    sessionId: string;
    type: ActivityType;
    actorId: string;
    targetId?: string;
    payload: Record<string, unknown>;
    createdAt: string;
}