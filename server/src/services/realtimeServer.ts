import type { Server as HttpServer } from "http";
import { getServerConfig } from "../config";
import { getSessionIdFromCookieHeader } from "../auth/session";
import { appendMockActivity } from "../storage/memory/activityStore";
import { getSessionContext } from "../storage/memory/bootstrapStore";

const createSocketServer = require("socket.io") as (server: HttpServer, options?: Record<string, unknown>) => any;

type SocketLike = any;
type SocketServerLike = any;

interface ConnectedUser {
    userId: string;
    displayName: string;
    roomId: string;
    socket: SocketLike;
    sessionId?: string;
}

interface SpawnedAvatarPresence {
    ownerUserId: string;
    targetUserId: string;
    agentId: string;
    displayName: string;
    spriteIndex: number;
    position: { x: number; y: number };
    summonPosition?: { x: number; y: number };
    wanderArea?: { x: number; y: number; width: number; height: number };
    lastInteractionAt: string;
    expiresAt: string;
}

interface RoomState {
    roomId: string;
    hostUserId?: string;
    users: Map<string, ConnectedUser>;
    characterStates: Map<string, Record<string, unknown>>;
    spawnedAvatarPresences: Map<string, SpawnedAvatarPresence>;
    gameTime?: number;
    gameState?: string;
    roomInfo: Record<string, unknown>;
}

interface ResolvedIdentity {
    userId: string;
    displayName: string;
    sessionId?: string;
}

const serverConfig = getServerConfig();
const rooms = new Map<string, RoomState>();
const socketIndex = new Map<string, { roomId: string; userId: string }>();
const SPAWNED_AVATAR_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

const getOrCreateRoom = (roomId: string): RoomState => {
    const existing = rooms.get(roomId);
    if (existing) {
        return existing;
    }

    const created: RoomState = {
        roomId,
        users: new Map<string, ConnectedUser>(),
        characterStates: new Map<string, Record<string, unknown>>(),
        spawnedAvatarPresences: new Map<string, SpawnedAvatarPresence>(),
        roomInfo: {}
    };
    rooms.set(roomId, created);
    return created;
};

const getRoomDisplayNames = (room: RoomState): string[] => {
    return Array.from(room.users.values()).map(user => user.displayName);
};

const getHostDisplayName = (room: RoomState): string => {
    if (!room.hostUserId) {
        return "";
    }
    return room.users.get(room.hostUserId)?.displayName ?? "";
};

const buildRoomInfoPayload = (room: RoomState, extra?: Record<string, unknown>): Record<string, unknown> => ({
    ...room.roomInfo,
    host: getHostDisplayName(room),
    users: getRoomDisplayNames(room),
    userIds: Array.from(room.users.keys()),
    spawnedAvatars: Array.from(room.spawnedAvatarPresences.values()),
    gameTime: room.gameTime,
    ...extra
});

const nowIso = (): string => new Date().toISOString();

const buildExpiryIso = (baseMs = Date.now()): string => new Date(baseMs + SPAWNED_AVATAR_IDLE_TIMEOUT_MS).toISOString();

const pruneExpiredSpawnedAvatars = (room: RoomState): boolean => {
    const nowMs = Date.now();
    let changed = false;
    room.spawnedAvatarPresences.forEach((presence, ownerUserId) => {
        const expiresAtMs = Date.parse(presence.expiresAt);
        if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
            room.spawnedAvatarPresences.delete(ownerUserId);
            changed = true;
        }
    });
    return changed;
};

const emitRoomInfo = (io: SocketServerLike, room: RoomState, extra?: Record<string, unknown>): void => {
    if (pruneExpiredSpawnedAvatars(room)) {
        io.to(room.roomId).emit("roomInfo", buildRoomInfoPayload(room, extra));
        return;
    }
    io.to(room.roomId).emit("roomInfo", buildRoomInfoPayload(room, extra));
};

const getRoomUsers = (roomId: string): string[] => {
    return getRoomDisplayNames(getOrCreateRoom(roomId));
};

export const isUserConnected = (userId: string): boolean => {
    if (!userId.trim()) {
        return false;
    }

    for (const room of rooms.values()) {
        if (room.users.has(userId)) {
            return true;
        }
    }

    return false;
};

const resolveRoomId = (socket: SocketLike): string => {
    const roomId = socket.handshake?.query?.room;
    if (typeof roomId === "string" && roomId.trim().length > 0) {
        return roomId.trim();
    }
    return serverConfig.defaultRoomId;
};

const resolveIdentityFromSocket = (socket: SocketLike): ResolvedIdentity | null => {
    const cookieHeader = socket.handshake?.headers?.cookie;
    const sessionContext = getSessionContext(getSessionIdFromCookieHeader(cookieHeader));
    if (sessionContext) {
        return {
            userId: sessionContext.user.userId,
            displayName: sessionContext.user.displayName,
            sessionId: sessionContext.session.sessionId
        };
    }

    const queryUserId = socket.handshake?.query?.userId;
    const queryUsername = socket.handshake?.query?.username;
    if (typeof queryUserId === "string" && queryUserId.trim().length > 0) {
        return {
            userId: queryUserId.trim(),
            displayName: typeof queryUsername === "string" && queryUsername.trim().length > 0 ? queryUsername.trim() : queryUserId.trim()
        };
    }

    if (typeof queryUsername === "string" && queryUsername.trim().length > 0) {
        const fallbackName = queryUsername.trim();
        return {
            userId: fallbackName,
            displayName: fallbackName
        };
    }

    return null;
};

const getConnection = (socketId: string): { room: RoomState; user: ConnectedUser } | null => {
    const socketEntry = socketIndex.get(socketId);
    if (!socketEntry) {
        return null;
    }

    const room = rooms.get(socketEntry.roomId);
    const user = room?.users.get(socketEntry.userId);
    if (!room || !user) {
        socketIndex.delete(socketId);
        return null;
    }

    return { room, user };
};

const assignNextHost = (room: RoomState): void => {
    const nextUser = room.users.keys().next();
    room.hostUserId = nextUser.done ? undefined : nextUser.value;
};

const createCharacterStatePayload = (room: RoomState, user: ConnectedUser, payload: Record<string, unknown>): Record<string, unknown> => {
    const previous = room.characterStates.get(user.userId) ?? {};
    return {
        ...previous,
        ...payload,
        id: user.userId,
        userId: user.userId,
        username: user.displayName,
        displayName: user.displayName
    };
};

const appendRealtimeActivity = (user: ConnectedUser, type: "room_joined" | "room_left", payload: Record<string, unknown>): void => {
    if (!user.sessionId) {
        return;
    }

    appendMockActivity({
        userId: user.userId,
        sessionId: user.sessionId,
        type,
        actorId: user.userId,
        payload
    });
};

const handleDisconnect = (io: SocketServerLike, socket: SocketLike): void => {
    const connection = getConnection(socket.id);
    if (!connection) {
        return;
    }

    const { room, user } = connection;
    const currentUser = room.users.get(user.userId);
    if (!currentUser || currentUser.socket !== socket) {
        socketIndex.delete(socket.id);
        return;
    }

    room.users.delete(user.userId);
    room.characterStates.delete(user.userId);
    socketIndex.delete(socket.id);

    if (room.hostUserId === user.userId) {
        assignNextHost(room);
    }

    if (room.users.size === 0) {
        rooms.delete(room.roomId);
    } else {
        io.to(room.roomId).emit("roomInfo", buildRoomInfoPayload(room, {
            playerLeft: user.displayName,
            playerLeftUserId: user.userId
        }));
    }

    appendRealtimeActivity(user, "room_left", {
        roomId: room.roomId,
        displayName: user.displayName
    });
};

export const attachRealtimeServer = (httpServer: HttpServer): { getRoomUsers: (roomId: string) => string[] } => {
    const io = createSocketServer(httpServer, {
        serveClient: false,
        cookie: false,
        path: "/socket.io"
    });

    io.on("connection", (socket: SocketLike) => {
        const identity = resolveIdentityFromSocket(socket);
        if (!identity) {
            socket.disconnect(true);
            return;
        }

        const roomId = resolveRoomId(socket);
        const room = getOrCreateRoom(roomId);
        const previousConnection = room.users.get(identity.userId);
        if (previousConnection && previousConnection.socket && previousConnection.socket !== socket) {
            previousConnection.socket.disconnect(true);
        }

        const user: ConnectedUser = {
            userId: identity.userId,
            displayName: identity.displayName,
            roomId,
            socket,
            sessionId: identity.sessionId
        };

        room.users.set(user.userId, user);
        if (!room.hostUserId || !room.users.has(room.hostUserId)) {
            room.hostUserId = user.userId;
        }

        socketIndex.set(socket.id, { roomId, userId: user.userId });
        socket.join(roomId);

        emitRoomInfo(io, room, {
            playerJoined: user.displayName,
            playerJoinedUserId: user.userId
        });

        socket.emit("playersUpdate", Array.from(room.characterStates.values()));
        if (typeof room.gameState === "string" && room.gameState.length > 0) {
            socket.emit("gameState", room.gameState);
        }
        if (typeof room.gameTime === "number") {
            socket.emit("gameTime", room.gameTime);
        }

        appendRealtimeActivity(user, "room_joined", {
            roomId,
            displayName: user.displayName
        });

        socket.on("characterUpdate", (payload: Record<string, unknown>) => {
            const connection = getConnection(socket.id);
            if (!connection || !payload || typeof payload !== "object") {
                return;
            }

            const isNewCharacter = !connection.room.characterStates.has(connection.user.userId);
            const snapshot = createCharacterStatePayload(connection.room, connection.user, payload);
            connection.room.characterStates.set(connection.user.userId, snapshot);

            if (isNewCharacter) {
                io.to(connection.room.roomId).emit("characterJoined", snapshot);
            }

            io.to(connection.room.roomId).emit("characterUpdate", snapshot);
        });

        socket.on("characterEvent", (payload: unknown) => {
            const connection = getConnection(socket.id);
            if (!connection) {
                return;
            }

            io.to(connection.room.roomId).emit("characterEvent", payload);
        });

        socket.on("directMessage", (payload: unknown) => {
            const connection = getConnection(socket.id);
            if (!connection || !payload || typeof payload !== "object") {
                return;
            }

            const targetUserId = typeof (payload as { targetUserId?: unknown }).targetUserId === "string"
                ? (payload as { targetUserId: string }).targetUserId.trim()
                : "";
            const text = typeof (payload as { text?: unknown }).text === "string"
                ? (payload as { text: string }).text.trim()
                : "";

            if (!targetUserId || !text) {
                return;
            }

            const recipient = connection.room.users.get(targetUserId);
            if (!recipient?.socket) {
                return;
            }

            recipient.socket.emit("directMessage", {
                fromUserId: connection.user.userId,
                fromDisplayName: connection.user.displayName,
                toUserId: recipient.userId,
                text,
                timestamp: Date.now()
            });
        });

        socket.on("playerConversationEvent", (payload: unknown) => {
            const connection = getConnection(socket.id);
            if (!connection || !payload || typeof payload !== "object") {
                return;
            }

            const targetUserId = typeof (payload as { targetUserId?: unknown }).targetUserId === "string"
                ? (payload as { targetUserId: string }).targetUserId.trim()
                : "";
            const action = (payload as { action?: unknown }).action;

            if (!targetUserId || (action !== "open" && action !== "close")) {
                return;
            }

            const recipient = connection.room.users.get(targetUserId);
            if (!recipient?.socket) {
                return;
            }

            recipient.socket.emit("playerConversationEvent", {
                fromUserId: connection.user.userId,
                fromDisplayName: connection.user.displayName,
                toUserId: recipient.userId,
                action,
                timestamp: Date.now()
            });
        });

        socket.on("gameState", (payload: unknown) => {
            const connection = getConnection(socket.id);
            if (!connection || typeof payload !== "string") {
                return;
            }

            connection.room.gameState = payload;
            io.to(connection.room.roomId).emit("gameState", payload);
        });

        socket.on("gameTime", (payload: unknown) => {
            const connection = getConnection(socket.id);
            if (!connection || typeof payload !== "number" || !Number.isFinite(payload)) {
                return;
            }

            connection.room.gameTime = payload;
            io.to(connection.room.roomId).emit("gameTime", payload);
        });

        socket.on("roomInfo", (payload: Record<string, unknown>) => {
            const connection = getConnection(socket.id);
            if (!connection || !payload || typeof payload !== "object") {
                return;
            }

            connection.room.roomInfo = {
                ...connection.room.roomInfo,
                ...payload
            };
            emitRoomInfo(io, connection.room);
        });

        socket.on("spawnedAvatarUpsert", (payload: unknown) => {
            const connection = getConnection(socket.id);
            if (!connection || !payload || typeof payload !== "object") {
                return;
            }

            const args = payload as {
                targetUserId?: unknown;
                agentId?: unknown;
                displayName?: unknown;
                spriteIndex?: unknown;
                position?: { x?: unknown; y?: unknown };
                summonPosition?: { x?: unknown; y?: unknown };
                wanderArea?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
            };

            const targetUserId = typeof args.targetUserId === "string" ? args.targetUserId.trim() : "";
            const agentId = typeof args.agentId === "string" ? args.agentId.trim() : "";
            const displayName = typeof args.displayName === "string" ? args.displayName.trim() : "";
            const spriteIndex = typeof args.spriteIndex === "number" && Number.isFinite(args.spriteIndex) ? args.spriteIndex : null;
            const x = typeof args.position?.x === "number" && Number.isFinite(args.position.x) ? args.position.x : null;
            const y = typeof args.position?.y === "number" && Number.isFinite(args.position.y) ? args.position.y : null;
            const summonX = typeof args.summonPosition?.x === "number" && Number.isFinite(args.summonPosition.x) ? args.summonPosition.x : null;
            const summonY = typeof args.summonPosition?.y === "number" && Number.isFinite(args.summonPosition.y) ? args.summonPosition.y : null;
            const wanderArea = args.wanderArea && typeof args.wanderArea === "object"
                && typeof args.wanderArea.x === "number" && Number.isFinite(args.wanderArea.x)
                && typeof args.wanderArea.y === "number" && Number.isFinite(args.wanderArea.y)
                && typeof args.wanderArea.width === "number" && Number.isFinite(args.wanderArea.width)
                && typeof args.wanderArea.height === "number" && Number.isFinite(args.wanderArea.height)
                ? {
                    x: args.wanderArea.x,
                    y: args.wanderArea.y,
                    width: args.wanderArea.width,
                    height: args.wanderArea.height
                }
                : undefined;

            if (!targetUserId || !agentId || !displayName || spriteIndex == null || x == null || y == null) {
                return;
            }

            const touchedAt = nowIso();
            connection.room.spawnedAvatarPresences.set(connection.user.userId, {
                ownerUserId: connection.user.userId,
                targetUserId,
                agentId,
                displayName,
                spriteIndex,
                position: { x, y },
                summonPosition: summonX != null && summonY != null ? { x: summonX, y: summonY } : undefined,
                wanderArea,
                lastInteractionAt: touchedAt,
                expiresAt: buildExpiryIso()
            });
            emitRoomInfo(io, connection.room);
        });

        socket.on("spawnedAvatarTouch", (payload: unknown) => {
            const connection = getConnection(socket.id);
            if (!connection || !payload || typeof payload !== "object") {
                return;
            }

            const agentId = typeof (payload as { agentId?: unknown }).agentId === "string"
                ? (payload as { agentId: string }).agentId.trim()
                : "";
            if (!agentId) {
                return;
            }

            let changed = false;
            connection.room.spawnedAvatarPresences.forEach((presence, ownerUserId) => {
                if (presence.agentId !== agentId) {
                    return;
                }
                changed = true;
                connection.room.spawnedAvatarPresences.set(ownerUserId, {
                    ...presence,
                    lastInteractionAt: nowIso(),
                    expiresAt: buildExpiryIso()
                });
            });

            if (changed) {
                emitRoomInfo(io, connection.room);
            }
        });

        socket.on("disconnect", () => {
            handleDisconnect(io, socket);
        });
    });

    return {
        getRoomUsers
    };

    const pruneInterval = setInterval(() => {
        rooms.forEach(room => {
            if (pruneExpiredSpawnedAvatars(room)) {
                io.to(room.roomId).emit("roomInfo", buildRoomInfoPayload(room));
            }
        });
    }, 30000);

    httpServer.on("close", () => {
        clearInterval(pruneInterval);
    });

};