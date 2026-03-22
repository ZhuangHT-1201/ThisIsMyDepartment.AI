import * as io from "socket.io-client";
import { ThisIsMyDepartmentApp } from "../../main/ThisIsMyDepartmentApp";
import { DEFAULT_DEV_ROOM_NAME, DEFAULT_SHARED_ROOM_NAME } from "../../main/constants";
import { getRealtimeSocketBaseUrl } from "../../main/runtimeConfig";
import { isDev } from "../util/env";

import { Service } from "../util/service";
import { Signal } from "../util/Signal";

export interface RoomInfoEvent {
    host: string,
    users: Array<string>,
    userIds?: Array<string>,
    playerJoined?: string,
    playerJoinedUserId?: string,
    playerLeft?: string,
    playerLeftUserId?: string,
    gameTime?: number
}

export interface ActionEvent {
    id: string | number | null;
    type: string;
    args: any;
}

export interface OnlineIdentity {
    userId?: string;
    displayName?: string;
}

export interface OnlinePlayerSnapshot {
    id?: string;
    userId?: string;
    username?: string;
    displayName?: string;
}

export interface DirectMessageEvent {
    fromUserId: string;
    fromDisplayName: string;
    toUserId: string;
    text: string;
    timestamp: number;
}

export interface PlayerConversationEvent {
    fromUserId: string;
    fromDisplayName: string;
    toUserId: string;
    action: "open" | "close";
    timestamp: number;
}

@Service
export class OnlineService {
    private static onlineBaseUrl = getRealtimeSocketBaseUrl();

    public static async getUsers(): Promise<any> {
        return (await fetch(`${OnlineService.onlineBaseUrl}${isDev() ? DEFAULT_DEV_ROOM_NAME : DEFAULT_SHARED_ROOM_NAME}`)).json();
    }
    /** The username of the current user. */
    public username = "";

    /** Stable app-level user identifier. */
    public userId = "";

    /** The usernames of the other players in this game. */
    public players: Set<string> = new Set();

    /** Stable user identifiers currently present in the room. */
    public playerIds: Set<string> = new Set();

    /** Emits on updates of some character in the game. */
    public onCharacterUpdate = new Signal<any>();

    /** Emits on updates of some characters actions. */
    public onCharacterAction = new Signal<ActionEvent>();

    /** Emits if the current user is target of an event. */
    public onPlayerUpdate = new Signal<any>();

    /** Emits if the current player has successfully connected. */
    public onPlayerConnect = new Signal<void>();

    /** Emits if the current player has lost connection. */
    public onPlayerDisconnect = new Signal<void>();

    /** Emits if a new player has connected. */
    public onOtherPlayerConnect = new Signal<string>();

    /** Emits if a new player has joined. */
    public onOtherPlayerJoined = new Signal<any>();

    /** Emits if a player has lost connection. */
    public onOtherPlayerDisconnect = new Signal<string>();

    /** Emits when another player sends a direct text message to the current user. */
    public onDirectMessage = new Signal<DirectMessageEvent>();

    /** Emits when another player opens or closes a direct conversation with the current user. */
    public onPlayerConversationEvent = new Signal<PlayerConversationEvent>();

    /** Emits if the gameState changed. Something like the host started the game. */
    public onGameStateUpdate = new Signal<string>();

    /** The socket.io client that handles all the updates. */
    private socket: SocketIOClient.Socket;

    /** Flag if the current user is the host of the room. */
    private _isHost = false;

    /** Holds the last gamestate in order to minimize unneeded payload. */
    private _lastGameState = "";

    /** Tracks whether the realtime socket is currently connected. */
    private _isConnected = false;

    public constructor(identity: string | OnlineIdentity = "") {
        if (isDev()) {
            (window as any).onlineService = this;
        }
        if (typeof identity === "string") {
            this.username = identity;
            this.userId = identity;
        } else {
            this.username = identity.displayName ?? "";
            this.userId = identity.userId ?? this.username;
        }
        let room = ThisIsMyDepartmentApp.instance?.JitsiInstance?.room.getName() ?? (isDev() ? DEFAULT_DEV_ROOM_NAME : DEFAULT_SHARED_ROOM_NAME);
        if (!room) {
            room = (Math.random() * 10000000).toFixed();
        }

        // Initialize socket and add current user to the list of users.
        this.socket = io.connect(OnlineService.onlineBaseUrl, {
            query: { room, username: this.username, userId: this.userId },
            transports: ["websocket"]
        });
        this.socket.on("connect", () => {
            this._isConnected = true;
            this.onPlayerConnect.emit();
            this.players.add(this.username!);
            this.playerIds.add(this.userId || this.username);
        });

        // Listen on characterUpdate. Those updates are related to every character in the game and thus are very time
        // sensitive.
        this.socket.on("characterUpdate", (val: any) => {
            // We have to differentiate between actions that are related to other users characters or our own.
            if (!this.isSelfEvent(val)) {
                this.onCharacterUpdate.emit(val);
            }
        });

        // Listen on characterJoined. Those updates are related to every character in the game and thus are very time
        // sensitive.
        this.socket.on("characterJoined", (val: any) => {
            // We have to differentiate between actions that are related to other users characters or our own.
            if (!this.isSelfEvent(val)) {
                this.onOtherPlayerJoined.emit(val);
            }
        });

        // Listen on playersUpdate. This is initially fired when a user joins the game.
        this.socket.on("playersUpdate", (val: Array<any>) => {
            val.forEach(player => {
                this.onOtherPlayerJoined.emit(player);
            });
        });

        // Listen on characterEvent. Those updates are related to every character in the game and thus are very time
        // sensitive.
        this.socket.on("characterEvent", (val: ActionEvent) => {
            // We have to differentiate between actions that are related to other users characters or our own.
            if (!this.isSelfEvent(val)) {
                this.onCharacterAction.emit(val);
            }
        });

        // Listen on updates of the room. Those are typically actions like players joining/leaving or host.switching.
        this.socket.on("roomInfo", (val: RoomInfoEvent) => {

            this._isHost = val.host === this.username;
            this.players = new Set(val.users);
            this.playerIds = new Set(val.userIds ?? []);
            if (val.playerJoined) {
                this.onOtherPlayerConnect.emit(val.playerJoinedUserId ?? val.playerJoined);
            }
            if (val.playerLeft || val.playerLeftUserId) {
                this.onOtherPlayerDisconnect.emit(val.playerLeftUserId ?? val.playerLeft!);
            }
        });

        // Listen on gameState changes. Those events are typically fired on gameStart, if the host starts a game or
        // other actions that result in stage-changes.
        this.socket.on("gameState", (val: string) => {
            this.onGameStateUpdate.emit(val);
        });

        this.socket.on("disconnect", () => {
            this._isConnected = false;
            this.onPlayerDisconnect.emit();
        });

        this.socket.on("directMessage", (val: DirectMessageEvent) => {
            if (!val || val.toUserId !== this.userId) {
                return;
            }
            this.onDirectMessage.emit(val);
        });

        this.socket.on("playerConversationEvent", (val: PlayerConversationEvent) => {
            if (!val || val.toUserId !== this.userId) {
                return;
            }
            this.onPlayerConversationEvent.emit(val);
        });
    }

    public isConnected(): boolean {
        return this._isConnected;
    }

    public sendDirectMessage(targetUserId: string, text: string): void {
        const trimmedTarget = targetUserId.trim();
        const trimmedText = text.trim();
        if (!trimmedTarget || !trimmedText) {
            return;
        }
        this.socket.emit("directMessage", {
            targetUserId: trimmedTarget,
            text: trimmedText
        });
    }

    public sendPlayerConversationEvent(targetUserId: string, action: "open" | "close"): void {
        const trimmedTarget = targetUserId.trim();
        if (!trimmedTarget) {
            return;
        }
        this.socket.emit("playerConversationEvent", {
            targetUserId: trimmedTarget,
            action
        });
    }

    /**
     * Returns if the currentUser is the host of this session.
     * @returns if the currentUser is the host of this session.
     */
    public isHost(): boolean {
        return this._isHost;
    }

    /**
     * Sends an update of the characters values to the server, so that other clients of the room can react to the
     * changes.
     * @param event - The event to be send as an update.
     */
    public emitCharacterUpdate(event: any): void {
        if (!event.username || event.username === this.username) {
            this.socket.emit("characterUpdate", event);
        }
    }

    /**
     * Sends an update of the gameState to the server, so that other clients of the room can react to the changes.
     * @param event - The event to be send as an update.
     */
    public emitGameState(event: string, startTime?: number): void {
        if (this._lastGameState === event) {
            return;
        }
        if (event === "startGame" && startTime) {
            this.socket.emit("gameTime", startTime / 1000);
        }
        this._lastGameState = event;
        this.socket.emit("gameState", event);
    }

    /**
     * Sends an update of the characters actions to the server, so that other clients of the room can react to the
     * changes.
     * @param event - the event to emit.
     */
    public emitCharacterEvent(event: ActionEvent) {
        if (event.id != null) {
            this.socket.emit("characterEvent", event);
        }
    }

    public getSelfIdentifier(): string {
        return this.userId || this.username;
    }

    public getPlayerIdentifier(snapshot: OnlinePlayerSnapshot | ActionEvent | any): string {
        if (!snapshot) {
            return "";
        }
        return snapshot.userId ?? snapshot.id ?? snapshot.username ?? "";
    }

    public isSelfEvent(snapshot: OnlinePlayerSnapshot | ActionEvent | any): boolean {
        const identifier = this.getPlayerIdentifier(snapshot);
        return identifier === this.userId || identifier === this.username;
    }
}
