import { DialogJSON } from "*.dialog.json";
import createCustomElements from "../customElements/createCustomElements";
import { UserVideoElement } from "../customElements/UserVideoElement";
import { Aseprite } from "../engine/assets/Aseprite";
import { asset } from "../engine/assets/Assets";
import { BitmapFont } from "../engine/assets/BitmapFont";
import { RGBColor } from "../engine/color/RGBColor";
import { Game } from "../engine/Game";
import { OnlineService } from "../engine/online/OnlineService";
import { Camera } from "../engine/scene/Camera";
import { FadeToBlack } from "../engine/scene/camera/FadeToBlack";
import { Direction } from "../engine/geom/Direction";
import { clamp } from "../engine/util/math";
import { sleep } from "../engine/util/time";
import JitsiInstance from "../Jitsi";
import JitsiConference from "../typings/Jitsi/JitsiConference";
import { HEADLINE_FONT, Layer, SMALL_FONT, STANDARD_FONT } from "./constants";
import { Dialog } from "./Dialog";
import { FxManager } from "./FxManager";
import { MusicManager } from "./MusicManager";
import { CharacterNode } from "./nodes/CharacterNode";
import { LightNode } from "./nodes/LightNode";
// import { NpcNode } from "./nodes/NpcNode";
import { OtherPlayerNode } from "./nodes/OtherPlayerNode";
import { PlayerNode } from "./nodes/PlayerNode";
import { PresentationBoardNode } from "./nodes/PresentationBoardNode";
import { TextInputNode } from "./nodes/TextInputNode";
import { LLMAgentNode } from "./nodes/LLMAgentNode";
import { LLMAgentService } from "./services/LLMAgentService";
import agentDefinitions from "./agents/index";
import { logActivity } from "./services/activity";
import { configureBackendLLMBridge } from "./services/backendLLMBridge";
import { loadBootstrapState } from "./services/bootstrap";
import { appendConversationMessage, fetchConversation } from "./services/conversations";
import { saveAvatarProfile, saveCharacterSystemPrompt } from "./services/profile";
import { shouldEnableJitsi } from "./runtimeConfig";
import { ConversationEntry, ConversationWindow, ConversationWindowDisplayOptions } from "./ui/ConversationWindow";
import { CharacterStatusOverlay } from "./ui/CharacterStatusOverlay";
import { SettingsOverlay } from "./ui/SettingsOverlay";
import { GameScene } from "./scenes/GameScene";
import { LoadingScene } from "./scenes/LoadingScene";
import type { LLMAgentDefinition } from "./agents/AgentDefinition";
import type { ActivityLogType } from "./services/activity";
import type { BootstrapState, CurrentUser, CurrentUserProfile } from "./types/currentUser";
import type { DirectMessageEvent, PlayerConversationEvent } from "../engine/online/OnlineService";

export enum GameStage {
    NONE = 0,
    START = 1,
    GAME = 2
}

export class ThisIsMyDepartmentApp extends Game {
    @asset(HEADLINE_FONT)
    public static readonly headlineFont: BitmapFont;
    @asset(STANDARD_FONT)
    public static readonly standardFont: BitmapFont;
    @asset(SMALL_FONT)
    public static readonly smallFont: BitmapFont;
    @asset([
        "sprites/characters/character.aseprite.json",
        "sprites/characters/dark_staff_black.aseprite.json",
        "sprites/characters/HalloweenGhost.aseprite.json",
        "sprites/characters/dark_casualjacket_orange_white.aseprite.json",
        "sprites/characters/light_male_pkmn_red.aseprite.json",
        "sprites/characters/femalenerdydark_green.aseprite.json",
        "sprites/characters/dark_graduation_orange.aseprite.json",
        "sprites/characters/light_female_pkmn_yellow.aseprite.json"

    ])
    public static characterSprites: Aseprite[];

    public static instance: ThisIsMyDepartmentApp;

    public preventPlayerInteraction = 0;
    public JitsiInstance?: JitsiInstance;

    private stageStartTime = 0;
    protected stageTime = 0;
    private dialogs: Dialog[] = [];
    private npcs: CharacterNode[] = [];
    private players: Record<string, OtherPlayerNode> = {};
    public room: JitsiConference | null = null;
    public userId: string = "anonymous-user";
    public userName: string = "anonymous";
    public sessionId: string = "local-session";

    private conversationWindow?: ConversationWindow;
    private characterStatusOverlay?: CharacterStatusOverlay;
    private settingsOverlay?: SettingsOverlay;
    private interactionHint?: HTMLDivElement;
    private activeConversationPartner: string | null = null;
    private conversationLogs = new Map<string, ConversationEntry[]>();
    private conversationPartners = new Map<string, { name: string; type: "agent" | "player" }>();
    private readonly conversationSyncRequests = new Map<string, number>();
    private readonly spawningPlayerIds = new Set<string>();
    private currentUser: CurrentUser | null = null;
    private currentUserProfile: CurrentUserProfile | null = null;
    private activityVersion = 0;

    private readonly llmService = LLMAgentService.instance;
    private activeLLMConversation: { agent: LLMAgentNode; playerId: string; pending: boolean } | null = null;
    private activePlayerConversation: { partnerId: string; partnerName: string } | null = null;
    private transientChatInput?: TextInputNode<ThisIsMyDepartmentApp>;
    private readonly agentDefinitions: LLMAgentDefinition[];

    private pushConversationDebug(event: string, payload?: Record<string, unknown>): void {
        const debugWindow = window as Window & {
            __timdConversationDebug?: Array<Record<string, unknown>>;
        };
        if (!debugWindow.__timdConversationDebug) {
            debugWindow.__timdConversationDebug = [];
        }
        debugWindow.__timdConversationDebug.push({
            ts: Date.now(),
            event,
            ...(payload ?? {})
        });
        if (debugWindow.__timdConversationDebug.length > 100) {
            debugWindow.__timdConversationDebug.splice(0, debugWindow.__timdConversationDebug.length - 100);
        }
    }

    // Game progress
    private gameStage = GameStage.START;
    public keyTaken = false; // key taken from corpse

    // Dialog
    private currentDialog: Dialog | null = null;

    @asset("dialog/train.dialog.json")
    private static readonly trainDialog: DialogJSON;
    private dialogChar?: CharacterNode;
    private wasAudioMuted = false;
    private wasVideoMuted = false;
    private needsAvatarOnboarding = false;
    public initialPlayerSprite = 0;


    public get onlineService(): OnlineService {
        return this._onlineService;
    }
    public set onlineService(service: OnlineService) {
        this._onlineService = service;
        this.onlineService.onOtherPlayerJoined.connect(event => {
            this.spawnOtherPlayer(event);
        });
        this.onlineService.onCharacterUpdate.connect(event => {
            if (!this.getOtherPlayerById(this.onlineService.getPlayerIdentifier(event))) {
                this.spawnOtherPlayer(event);
            }
        });
        this.onlineService.onOtherPlayerDisconnect.connect(playerId => {
            this.removePlayer(playerId);
            this.checkIfPlayersShouldBeRemoved();
        });
        this.onlineService.onDirectMessage.connect(event => {
            this.handleDirectPlayerMessage(event);
        });
        this.onlineService.onPlayerConversationEvent.connect(event => {
            this.handlePlayerConversationEvent(event);
        });
    }
    private _onlineService!: OnlineService;

    public getAgentDefinitions(): readonly LLMAgentDefinition[] {
        return this.agentDefinitions;
    }

    public constructor(agentDefinitions: LLMAgentDefinition[], bootstrapState: BootstrapState) {
        super();
        this.applyBootstrapState(bootstrapState);
        this.agentDefinitions = this.resolveAgentDefinitions(agentDefinitions, bootstrapState);
    }

    // Called by GameScene
    public setupScene(): void {
        this.pushConversationDebug("setupScene");
        // TODO Enable this when npc can be synced
        // this.spawnNPCs();
        this.setStage(GameStage.GAME);
        if (shouldEnableJitsi()) {
            this.JitsiInstance = new JitsiInstance();
            this.JitsiInstance.create().then(room => {
                this.room = room;
                this.room.setDisplayName(this.userName);
                this.recordActivity({
                    type: "room_joined",
                    payload: {
                        roomId: room.getName?.() ?? "unknown-room"
                    }
                });
            }).catch(error => {
                console.warn("Jitsi initialization failed", error);
                this.JitsiInstance = undefined;
            });
        }
        // Assets cannot be loaded in constructor because the LoadingScene
        // is not initialized at constructor time and Assets are loaded in the LoadingScene
        this.dialogs = [
            new Dialog(ThisIsMyDepartmentApp.trainDialog)
        ];

        this.input.onButtonUp.filter(e => e.isPlayerChat).connect(() => this.handleChat(), this);

        this.keyboard.onKeyPress.filter(ev => ev.key === "9" && ev.ctrlKey).connect((ev) => { ev.preventDefault(); this.preventPlayerInteraction = 0;});

        this.input.onDrag.filter(e => e.isRightStick && !!e.direction && e.direction.getLength() > 0.3).connect(this.getPlayer().handleControllerInput, this.getPlayer());

        this.ensureConversationWindow();
        this.repositionConversationWindow();
        this.ensureCharacterStatusOverlay();
        this.ensureInteractionHint();
    }

    private applyBootstrapState(bootstrapState: BootstrapState): void {
        this.setCurrentUser(bootstrapState.user);
        this.userId = bootstrapState.user?.userId ?? "anonymous-user";
        this.userName = bootstrapState.user?.displayName ?? "Guest";
        this.sessionId = bootstrapState.session?.sessionId ?? "local-session";
        this.setCurrentUserProfile(bootstrapState.profile);
        this.needsAvatarOnboarding = !bootstrapState.profile?.avatar;
        this.initialPlayerSprite = bootstrapState.profile?.avatar?.spriteIndex ?? 0;
        this.onlineService = new OnlineService({
            userId: this.userId,
            displayName: this.userName
        });
    }

    private resolveAgentDefinitions(fallbackDefinitions: LLMAgentDefinition[], bootstrapState: BootstrapState): LLMAgentDefinition[] {
        if (bootstrapState.agents.length === 0) {
            return fallbackDefinitions;
        }

        return bootstrapState.agents.map(agent => ({
            id: `agent-${agent.agentId}`,
            agentId: agent.agentId,
            displayName: agent.displayName,
            spriteIndex: agent.spriteIndex,
            position: agent.position,
            caption: agent.caption,
            systemPrompt: agent.defaultSystemPrompt,
            provider: agent.provider,
            model: agent.model,
            walkArea: agent.walkArea
        }));
    }

    public shouldShowAvatarOnboarding(): boolean {
        return this.needsAvatarOnboarding;
    }

    public getCurrentUser(): CurrentUser | null {
        return this.cloneCurrentUser(this.currentUser);
    }

    public setCurrentUser(user: CurrentUser | null | undefined): void {
        this.currentUser = this.cloneCurrentUser(user ?? null);
    }

    public markAvatarOnboardingComplete(spriteIndex: number): void {
        this.initialPlayerSprite = spriteIndex;
        this.needsAvatarOnboarding = false;
    }

    public getCurrentUserProfile(): CurrentUserProfile | null {
        return this.cloneCurrentUserProfile(this.currentUserProfile);
    }

    public setCurrentUserProfile(profile: CurrentUserProfile | null | undefined): void {
        this.currentUserProfile = this.cloneCurrentUserProfile(profile ?? null);
    }

    public openCharacterSystemPromptEditor(): void {
        this.openSettingsOverlay("ai-prompt");
    }

    public isLocalAudioEnabled(): boolean {
        return this.JitsiInstance?.isLocalAudioEnabled() ?? false;
    }

    public isLocalVideoEnabled(): boolean {
        return this.JitsiInstance?.isLocalVideoEnabled() ?? false;
    }

    public toggleLocalAudio(): boolean {
        if (!this.JitsiInstance) {
            this.showNotification("Audio controls are not ready yet.");
            return false;
        }
        const enabled = this.JitsiInstance.toggleLocalAudio();
        this.refreshConversationMediaState();
        this.characterStatusOverlay?.refresh();
        return enabled;
    }

    public toggleLocalVideo(): boolean {
        if (!this.JitsiInstance) {
            this.showNotification("Camera controls are not ready yet.");
            return false;
        }
        const enabled = this.JitsiInstance.toggleLocalVideo();
        this.refreshConversationMediaState();
        this.characterStatusOverlay?.refresh();
        this.updateConversationMediaLayout();
        return enabled;
    }

    public openSettingsOverlay(initialTab: "media" | "character" | "ai-prompt" = "media"): void {
        if (!this.settingsOverlay) {
            this.settingsOverlay = new SettingsOverlay();
        }

        this.settingsOverlay.open({
            initialTab,
            initialSpriteIndex: this.currentUserProfile?.avatar?.spriteIndex ?? this.initialPlayerSprite,
            initialPrompt: this.currentUserProfile?.characterSystemPrompt ?? "",
            getMediaDevices: async () => {
                const enumeratedDevices = await this.enumerateMediaDevices();
                return enumeratedDevices.map((device, index) => ({
                    deviceId: device.deviceId,
                    kind: device.kind as "audioinput" | "audiooutput" | "videoinput",
                    label: this.getDeviceDisplayLabel(device, index + 1)
                }));
            },
            onAvatarSave: async (spriteIndex: number) => {
                await this.saveAvatarSelection(spriteIndex);
            },
            onPromptSave: async (prompt: string) => {
                await this.saveOwnCharacterSystemPrompt(prompt);
            },
            onMediaDeviceChange: async (kind, deviceId) => {
                if (!this.JitsiInstance) {
                    throw new Error("Media controls are not ready yet.");
                }
                if (kind === "audiooutput") {
                    this.JitsiInstance.changeAudioOutput(deviceId);
                    return;
                }
                if (kind === "audioinput") {
                    this.JitsiInstance.changeAudioInput(deviceId);
                    return;
                }
                this.JitsiInstance.changeVideoInput(deviceId);
            }
        });
    }

    private getCurrentUserId(): string {
        return this.userId || this.room?.myUserId() || "local-player";
    }

    private async saveAvatarSelection(spriteIndex: number): Promise<void> {
        const result = await saveAvatarProfile(spriteIndex);
        if (!result) {
            throw new Error("Avatar update failed.");
        }

        this.setCurrentUserProfile(result.profile);
        this.markAvatarOnboardingComplete(spriteIndex);

        if (this.isInGameScene()) {
            this.getPlayer().changeSprite(spriteIndex);
        }

        this.showNotification("Avatar updated.");
    }

    private async saveOwnCharacterSystemPrompt(prompt: string): Promise<void> {
        const result = await saveCharacterSystemPrompt(prompt);
        if (!result) {
            throw new Error("Character prompt update failed.");
        }
        this.setCurrentUserProfile(result.profile);
        this.showNotification(prompt.trim().length > 0 ? "Character AI prompt saved." : "Character AI prompt cleared.");
    }

    private async enumerateMediaDevices(): Promise<MediaDeviceInfo[]> {
        const mediaDevicesApi = this.JitsiInstance?.JitsiMeetJS.mediaDevices;
        if (mediaDevicesApi?.enumerateDevices) {
            const devices = await new Promise<MediaDeviceInfo[]>((resolve, reject) => {
                try {
                    mediaDevicesApi.enumerateDevices((entries: MediaDeviceInfo[]) => resolve(entries));
                } catch (error) {
                    reject(error);
                }
            });
            return devices.filter(device => device.kind === "audioinput" || device.kind === "audiooutput" || device.kind === "videoinput");
        }

        if (navigator.mediaDevices?.enumerateDevices) {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.filter(device => device.kind === "audioinput" || device.kind === "audiooutput" || device.kind === "videoinput");
        }

        throw new Error("Media device enumeration is not available in this browser.");
    }

    private getDeviceDisplayLabel(device: MediaDeviceInfo, index: number): string {
        const label = device.label?.trim();
        if (label) {
            return label;
        }
        if (device.deviceId === "default") {
            if (device.kind === "audioinput") {
                return "Default Microphone";
            }
            if (device.kind === "audiooutput") {
                return "Default Speaker";
            }
            return "Default Camera";
        }
        if (device.kind === "audioinput") {
            return `Microphone ${index}`;
        }
        if (device.kind === "audiooutput") {
            return `Speaker ${index}`;
        }
        return `Camera ${index}`;
    }

    private cloneCurrentUserProfile(profile: CurrentUserProfile | null): CurrentUserProfile | null {
        if (!profile) {
            return null;
        }

        return {
            ...profile,
            avatar: profile.avatar ? { ...profile.avatar } : undefined,
            preferences: { ...profile.preferences }
        };
    }

    private cloneCurrentUser(user: CurrentUser | null): CurrentUser | null {
        if (!user) {
            return null;
        }

        return {
            ...user,
            roles: [...user.roles]
        };
    }

    public getActivityVersion(): number {
        return this.activityVersion;
    }

    private recordActivity(args: { type: ActivityLogType; actorId?: string; targetId?: string; payload?: Record<string, unknown> }): void {
        void logActivity({
            type: args.type,
            actorId: args.actorId ?? this.getCurrentUserId(),
            targetId: args.targetId,
            payload: {
                sessionId: this.sessionId,
                ...args.payload
            }
        }).then(() => {
            this.activityVersion += 1;
        }).catch(() => {
            // Ignore logging failures here; callers already treat activity capture as best-effort.
        });
    }

    public recordIFrameOpened(url: string): void {
        this.recordActivity({
            type: "iframe_opened",
            payload: {
                url
            }
        });
    }

    public recordIFrameClosed(url: string): void {
        this.recordActivity({
            type: "iframe_closed",
            payload: {
                url
            }
        });
    }

    public recordIFrameUrlChanged(originalUrl: string, newUrl: string): void {
        this.recordActivity({
            type: "iframe_url_changed",
            payload: {
                originalUrl,
                newUrl
            }
        });
    }

    public update(dt: number, time: number): void {
        this.stageTime = time - this.stageStartTime;
        this.characterStatusOverlay?.refresh();
        this.updateInteractionHint();
        switch (this.gameStage) {
            case GameStage.GAME:
                this.updateGame();
                break;
        }
        super.update(dt, time);
    }

    public setStage(stage: GameStage): void {
        if (stage !== this.gameStage) {
            this.gameStage = stage;
            this.stageStartTime = this.getTime();
            this.initGame();
        }
    }

    /*private spawnNPCs(): void {
        const chars = [ new NpcNode({spriteIndex: 0}), new NpcNode({spriteIndex: 1}), new NpcNode({spriteIndex: 2}), new NpcNode({spriteIndex: 3}), new NpcNode({spriteIndex: 4}) ];
        const positions = [ 644, 680, 720, 760, 800 ];
        for (let i = 0; i < chars.length; i++) {
            chars[i].moveTo(positions[i], 512).appendTo(this.getGameScene().rootNode);
        }
        this.npcs = chars;
    }*/

    public removePlayer(id: string): void {
        const player = this.players[id];
        if (!player) {
            return;
        }

        if (this.activePlayerConversation?.partnerId === id) {
            this.closePlayerConversation(id, { sync: false });
        }

        player.remove();
        delete this.players[id];
    }

    public sendCommand(eventName: string, value: any): void {
        const userId = this.room?.myUserId();
        if (userId != null) {
            this.room?.sendCommandOnce(eventName, { value: JSON.stringify({...value, spriteIndex: this.getPlayer().spriteIndex, id: userId}) });
        }
    }

    public showNotification(str: string): void {
        if (this.isInGameScene()) {
            this.getGameScene().notificationNode?.showNotification(str);
        }
    }

    public handleOtherPlayerPresentationUpdate(args: { presentationBoardId: number, slide: number; id: string}): void {
        const presentationBoard = this.getGameScene()?.rootNode.getDescendantsByType<PresentationBoardNode>(PresentationBoardNode)
            .find(n => n.boardId === args.presentationBoardId);
        if (args.slide === -1) {
            this.getCamera().focus(this.getPlayer(), { follow: true });
            presentationBoard?.endPresentation();
            this.preventPlayerInteraction = clamp(this.preventPlayerInteraction - 1, 0, Infinity);
            this.turnOnAllLights();
            if (!this.wasAudioMuted) {
                this.room?.getLocalAudioTrack()?.unmute();
            }
            if (!this.wasVideoMuted) {
                this.room?.getLocalVideoTrack()?.unmute();
            }
            this.room?.getParticipants()?.forEach(p => {
                const pId = p.getId();
                const parentElement = document.getElementById(`${pId}video`)?.parentElement;
                if (parentElement) {
                    parentElement.hidden = false;
                }
            });
            const localVid = document.getElementById("localVideo")?.parentElement;
            if (localVid != null) {
                localVid.hidden = false;
            }
        } else if (this.getCamera().getFollow() === presentationBoard && presentationBoard != null) {
            presentationBoard.setSlide(args.slide);
        } else if (presentationBoard != null) {
            this.showNotification((this.room?.getParticipantById(args.id).getDisplayName() ?? "anonymous") + " started to present");
            this.getCamera().focus(presentationBoard).then((successful) => {
                if (successful) {
                    this.getCamera().setFollow(presentationBoard);
                    presentationBoard?.startPresentation();
                    this.preventPlayerInteraction++;
                    this.dimLights();
                    this.wasAudioMuted = !!this.room?.getLocalAudioTrack()?.isMuted();
                    this.wasVideoMuted = !!this.room?.getLocalAudioTrack()?.isMuted();
                    this.room?.getParticipants()?.filter(p => p.getId() !== args.id).forEach(p => {
                        const pId = p.getId();
                        const parentElement = document.getElementById(`${pId}video`)?.parentElement;
                        if (parentElement != null) {
                            parentElement.hidden = true;
                            console.log("Hide element");
                        }
                    });
                    this.room?.getLocalAudioTrack()?.mute();
                    // this.room?.getLocalVideoTrack()?.mute();
                    const localVid = document.getElementById("localVideo")?.parentElement;
                    if (localVid != null) {
                        localVid.hidden = true;
                    }
                }
            });
        }

    }

    public dimLights() {
        const lights = this.getAllLights();
        for (const light of lights) {
            light.setColor(new RGBColor(1, 1, 0.8));
        }
        const ambients = this.getAmbientLights();
        for (const ambient of ambients) {
            ambient.setColor(new RGBColor(0.3, 0.3, 0.3));
        }
    }

    public turnOnAllLights() {
        const lights = this.getAllLights();
        for (const light of lights) {
            light.setColor(new RGBColor(0.8, 0.8, 1));
        }
        const ambients = this.getAmbientLights();
        for (const ambient of ambients) {
            ambient.setColor(new RGBColor(1, 1, 1));
        }
    }

    private handleChat(): void {
        if (!this.isInGameScene()) {
            return;
        }
        const textInputNode = new TextInputNode<ThisIsMyDepartmentApp>("", "ENTER TEXT", undefined, true, { anchor: Direction.TOP_RIGHT, layer: Layer.HUD, padding: 4 });
        this.getGameScene().rootNode.appendChild(textInputNode);
        this.transientChatInput = textInputNode;
        this.positionChatInputNode(textInputNode);
        textInputNode.focus();
        textInputNode.onTextSubmit.connect(text => {
            const otherPlayers = this.getGameScene()?.rootNode.getDescendantsByType<OtherPlayerNode>(OtherPlayerNode);
            const filteredPlayers = otherPlayers
                .filter(p => p.getPosition().getDistance(this.getPlayer().getPosition()) < 50)
                .map(p => p.getId()!);
            if (filteredPlayers.length > 0) {
                filteredPlayers.forEach(p => {
                    this.room?.sendMessage(text, p);
                });
            } else {
                this.room?.sendMessage(text);
            }
            if (text) {
                if (filteredPlayers.length > 0) {
                    this.handleOutgoingPlayerChat(filteredPlayers, text);
                } else {
                    this.handleOutgoingBroadcastChat(text);
                }
                this.getPlayer().say(text, 5);
            }
            textInputNode.onTextSubmit.clear();
            this.transientChatInput = undefined;
            textInputNode.remove();
            this.repositionChatInputs();
        });
    }

    public startLLMConversation(agent: LLMAgentNode): void {
        this.pushConversationDebug("startLLMConversation", {
            isInGameScene: this.isInGameScene(),
            agentId: agent.getAgentId()
        });
        if (!this.isInGameScene()) {
            return;
        }
        this.closePlayerConversation();
        const playerId = this.getCurrentUserId();
        const player = this.getPlayer();
        if (!player) {
            return;
        }

        if (this.activeLLMConversation?.agent === agent) {
            this.closeLLMConversation(agent);
            return;
        }

        this.closeLLMConversation();

        const agentId = agent.getAgentId();
        const agentName = agent.getDisplayName();
        agent.inConversation = true;
        this.activeLLMConversation = { agent, playerId, pending: false };
        this.focusConversation(agentId, { name: agentName, type: "agent" });
        this.conversationWindow?.focusComposer();
    }

    private closeLLMConversation(agent?: LLMAgentNode, options?: { resetHistory?: boolean }): void {
        if (!this.activeLLMConversation) {
            return;
        }
        if (agent && this.activeLLMConversation.agent !== agent) {
            return;
        }

        const { agent: activeAgent, playerId } = this.activeLLMConversation;
        activeAgent.endConversation(playerId, options?.resetHistory ?? false);
        activeAgent.say();
        this.handleConversationClosed(activeAgent.getAgentId());
        this.activeLLMConversation = null;
    }

    public startPlayerConversation(partnerId: string, partnerName: string, options?: { sync?: boolean; focusInput?: boolean }): void {
        this.pushConversationDebug("startPlayerConversation", {
            isInGameScene: this.isInGameScene(),
            partnerId,
            partnerName,
            sync: options?.sync ?? true,
            focusInput: options?.focusInput ?? true
        });
        if (!this.isInGameScene() || !partnerId) {
            return;
        }

        const sync = options?.sync ?? true;
        const focusInput = options?.focusInput ?? true;

        this.closeLLMConversation();
        this.focusConversation(partnerId, { name: partnerName, type: "player" });

        if (this.activePlayerConversation?.partnerId === partnerId) {
            if (focusInput) {
                this.conversationWindow?.focusComposer();
            }
            if (sync) {
                this.onlineService.sendPlayerConversationEvent(partnerId, "open");
            }
            this.updateConversationMediaLayout();
            return;
        }

        this.closePlayerConversation(undefined, { sync });
        this.activePlayerConversation = {
            partnerId,
            partnerName
        };
        this.refreshConversationMediaState();
        if (focusInput) {
            this.conversationWindow?.focusComposer();
        }
        if (sync) {
            this.onlineService.sendPlayerConversationEvent(partnerId, "open");
        }
        this.presentConversation(partnerId);
        this.updateConversationMediaLayout();
    }

    private closePlayerConversation(partnerId?: string, options?: { sync?: boolean }): void {
        if (!this.activePlayerConversation) {
            this.updateConversationMediaLayout();
            return;
        }
        if (partnerId && this.activePlayerConversation.partnerId !== partnerId) {
            return;
        }

        const sync = options?.sync ?? true;

        const { partnerId: activePartnerId } = this.activePlayerConversation;
        this.activePlayerConversation = null;
        this.handleConversationClosed(activePartnerId);
        if (sync) {
            this.onlineService.sendPlayerConversationEvent(activePartnerId, "close");
        }
        this.refreshConversationMediaState();
        this.updateConversationMediaLayout();
    }

    public async startDialog(num: number, char?: CharacterNode): Promise<void> {
        if (this.currentDialog) {
            // Shut up all characters
            this.npcs.forEach(npc => npc.say());
            this.getPlayer().say();
            if (this.dialogChar) {
                this.dialogChar.inConversation = false;
                this.dialogChar = undefined;
            }
            this.currentDialog = null;
            return;
        }
        this.currentDialog = this.dialogs[num];
        if (this.dialogChar != null && this.dialogChar !== char) {
            this.dialogChar.inConversation = false;
        }
        this.dialogChar = char;
        if (this.dialogChar) {
            this.dialogChar.inConversation = true;
        }
        /*const line = await OnlineService.getDialogLine();
        if (line != null) {
            // Shut up all characters
            this.npcs.forEach(npc => npc.say());
            this.getPlayer().say();
            char?.say(line);
        }*/
    }

    private updateGame(): void {
        if (this.activeLLMConversation) {
            let player: PlayerNode | undefined;
            try {
                player = this.getPlayer();
            } catch (e) {
                player = undefined;
            }
            if (!player || !this.activeLLMConversation.agent.isPlayerInRange(player)) {
                this.closeLLMConversation(this.activeLLMConversation.agent);
            }
        }
        if (this.activePlayerConversation && !this.isOtherPlayerInConversationRange(this.activePlayerConversation.partnerId)) {
            this.closePlayerConversation(this.activePlayerConversation.partnerId);
        }
    }

    public initGame(): void {
        // Place player into world
        const player = this.getPlayer();
        player.changeSprite(this.initialPlayerSprite);
        const pos = player.getScenePosition();
        const spawnOffset = this.getInitialSpawnOffset();
        player.remove().moveTo(pos.x + spawnOffset.x, pos.y + spawnOffset.y).appendTo(this.getGameScene().rootNode);
        MusicManager.getInstance().loopTrack(0);
        FxManager.getInstance().playSounds();
    }

    private getInitialSpawnOffset(): { x: number; y: number } {
        const userId = this.getCurrentUserId();
        let hash = 0;
        for (let index = 0; index < userId.length; index += 1) {
            hash = ((hash << 5) - hash) + userId.charCodeAt(index);
            hash |= 0;
        }

        const slots = [
            { x: 0, y: 0 },
            { x: 18, y: 0 },
            { x: -18, y: 0 },
            { x: 0, y: 18 },
            { x: 0, y: -18 },
            { x: 14, y: 14 },
            { x: -14, y: 14 },
            { x: 14, y: -14 },
            { x: -14, y: -14 }
        ];

        return slots[Math.abs(hash) % slots.length];
    }

    public getPlayer(id?: string): PlayerNode {
        return this.getGameScene().rootNode.getDescendantsByType<PlayerNode>(PlayerNode)[0];
    }

    public getOtherPlayerById(id: string): OtherPlayerNode | null {
        return this.players[id];
    }

    public findNearbyOtherPlayer(): OtherPlayerNode | null {
        const player = this.getPlayer();
        const playerPos = player.getScenePosition();
        const range = 50;
        let closest: OtherPlayerNode | null = null;
        let closestDistance = Number.POSITIVE_INFINITY;

        Object.values(this.players).forEach(otherPlayer => {
            const distance = otherPlayer.getScenePosition().getSquareDistance(playerPos);
            if (distance <= range ** 2 && distance < closestDistance) {
                closest = otherPlayer;
                closestDistance = distance;
            }
        });

        return closest;
    }

    private ensureInteractionHint(): void {
        if (this.interactionHint) {
            return;
        }

        const hint = document.createElement("div");
        hint.hidden = true;
        hint.style.position = "fixed";
        hint.style.left = "50%";
        hint.style.bottom = "26px";
        hint.style.transform = "translateX(-50%)";
        hint.style.zIndex = "9997";
        hint.style.padding = "8px 14px";
        hint.style.border = "1px solid rgba(196, 215, 154, 0.45)";
        hint.style.background = "rgba(12, 20, 15, 0.9)";
        hint.style.color = "#eef4d2";
        hint.style.font = "600 12px 'Trebuchet MS', 'Segoe UI', sans-serif";
        hint.style.letterSpacing = "0.06em";
        hint.style.textTransform = "uppercase";
        hint.style.pointerEvents = "none";
        hint.style.boxShadow = "0 10px 24px rgba(0, 0, 0, 0.35)";
        hint.style.clipPath = "polygon(0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px))";
        document.body.appendChild(hint);
        this.interactionHint = hint;
    }

    private updateInteractionHint(): void {
        if (!this.interactionHint || !this.isInGameScene()) {
            return;
        }

        if (this.activePlayerConversation) {
            this.interactionHint.hidden = true;
            return;
        }

        const nearbyPlayer = this.findNearbyOtherPlayer();
        if (!nearbyPlayer) {
            this.interactionHint.hidden = true;
            return;
        }

        this.interactionHint.textContent = `Press E to Chat with ${nearbyPlayer.getDisplayName()}`;
        this.interactionHint.hidden = false;
    }

    public getGameScene(): GameScene {
        const scene = this.scenes.getScene(GameScene);
        if (!scene) {
            throw new Error("GameScene not available");
        }
        return scene;
    }

    public checkIfPlayersShouldBeRemoved(): string | null {
        if (this.scenes.getScene(GameScene)) {
            const playersToRemove: OtherPlayerNode[] = [];
            for (const playerId in this.players) {
                if (!Object.prototype.hasOwnProperty.call(this.players, playerId)) {
                    continue;
                }
                const player = this.players[playerId];
                if (player && !this.onlineService.playerIds.has(String(player.getIdentifier()))) {
                    playersToRemove.push(player);
                }
            }
            if (playersToRemove.length > 0) {
                playersToRemove.forEach(player => this.removePlayer(String(player.getIdentifier())));
                return playersToRemove[0].getIdentifier() as string;
            }
        }
        return null;
    }

    public async spawnOtherPlayer(event: any): Promise<void> {
        const targetPlayerId = this.onlineService.getPlayerIdentifier(event);
        if (event == null || !event.position || !targetPlayerId || this.onlineService.isSelfEvent(event)) {
            return;
        }
        if (this.spawningPlayerIds.has(targetPlayerId)) {
            return;
        }
        console.log("Should spawn other player: ", event);
        this.spawningPlayerIds.add(targetPlayerId);
        try {
            if (!this.scenes.getScene(GameScene)) {
                this.scenes.setScene(GameScene as any);
            }
            while (!this.scenes.getScene(GameScene)) {
                await sleep(100);
            }

            const existingPlayer = this.getOtherPlayerById(targetPlayerId);
            if (existingPlayer) {
                this.applyOtherPlayerSnapshot(existingPlayer, event);
                return;
            }

            try {
                this.getGameScene();
            } catch (_) {
                await this.scenes.setScene(GameScene as any);
            }
            const otherPlayer = new OtherPlayerNode(targetPlayerId, event.spriteIndex ?? 0, event.displayName ?? event.username ?? targetPlayerId);
            this.getGameScene().rootNode?.appendChild(otherPlayer);
            this.applyOtherPlayerSnapshot(otherPlayer, event);
            otherPlayer.reset();

            this.players[targetPlayerId] = otherPlayer;
        } finally {
            this.spawningPlayerIds.delete(targetPlayerId);
        }
    }

    private applyOtherPlayerSnapshot(player: OtherPlayerNode, event: any): void {
        if (event.username || event.displayName) {
            player.changePlayerName(event.displayName ?? event.username);
        }
        if (typeof event.spriteIndex === "number") {
            player.changeSprite(event.spriteIndex);
        }
        if (event.position) {
            player.moveTo(event.position.x ?? player.getX(), event.position.y ?? player.getY());
        }
    }

    public isInGameScene(): boolean {
        return this.scenes.getScene(GameScene) != null;
    }

    public getFader(): FadeToBlack {
        return this.getCamera().fadeToBlack;
    }

    public getCamera(): Camera {
        return this.getGameScene().camera;
    }

    public getAmbientLights(lights = this.getAllLights()): LightNode[] {
        return lights.filter(light => light.getId()?.includes("ambient"));
    }

    public getAllLights(): LightNode[] {
        return this.getGameScene().rootNode.getDescendantsByType<LightNode>(LightNode);
    }

    public log(el: any) {
        console.log(el);
    }

    public handleParticipantChat(participantId: string, displayName: string, text: string, fromSelf: boolean): void {
        if (!text.trim()) {
            return;
        }
        if (fromSelf) {
            return;
        }

        this.recordActivity({
            type: "player_chat_received",
            actorId: participantId,
            targetId: this.getCurrentUserId(),
            payload: {
                message: text,
                displayName
            }
        });

        this.focusConversation(participantId, { name: displayName, type: "player" });
        this.appendConversationEntry(participantId, {
            senderId: participantId,
            senderName: displayName,
            text,
            timestamp: Date.now(),
            fromSelf: false
        });
    }

    private handleDirectPlayerMessage(event: DirectMessageEvent): void {
        if (!event.text.trim()) {
            return;
        }

        this.recordActivity({
            type: "player_chat_received",
            actorId: event.fromUserId,
            targetId: this.getCurrentUserId(),
            payload: {
                message: event.text,
                displayName: event.fromDisplayName,
                channel: "interaction"
            }
        });

        this.startPlayerConversation(event.fromUserId, event.fromDisplayName, {
            sync: false,
            focusInput: false
        });
        this.appendConversationEntry(event.fromUserId, {
            senderId: event.fromUserId,
            senderName: event.fromDisplayName,
            text: event.text,
            timestamp: event.timestamp || Date.now(),
            fromSelf: false
        });
    }

    private handlePlayerConversationEvent(event: PlayerConversationEvent): void {
        if (event.action === "open") {
            this.startPlayerConversation(event.fromUserId, event.fromDisplayName, {
                sync: false,
                focusInput: false
            });
            return;
        }

        this.closePlayerConversation(event.fromUserId, { sync: false });
    }

    public layoutConversationWindow(): void {
        this.repositionConversationWindow();
    }

    public isPointerOverUi(sceneX: number, sceneY: number): boolean {
        const window = this.conversationWindow;
        if (window && !window.isHidden() && window.containsPoint(sceneX, sceneY)) {
            return true;
        }
        return false;
    }

    private ensureConversationWindow(): ConversationWindow | undefined {
        this.pushConversationDebug("ensureConversationWindow", {
            isInGameScene: this.isInGameScene(),
            hasWindow: !!this.conversationWindow
        });
        if (!this.isInGameScene()) {
            return this.conversationWindow;
        }
        const scene = this.getGameScene();
        if (!this.conversationWindow) {
            this.conversationWindow = new ConversationWindow();
            this.conversationWindow.onSubmit.connect(text => {
                void this.handleConversationWindowSubmit(text);
            }, this);
            this.conversationWindow.onCloseRequested.connect(() => {
                this.handleConversationWindowClose();
            }, this);
        }
        if (this.conversationWindow.getParent() !== scene.rootNode) {
            this.conversationWindow.remove();
            scene.rootNode.appendChild(this.conversationWindow);
        }
        return this.conversationWindow;
    }

    private ensureCharacterStatusOverlay(): void {
        if (!this.characterStatusOverlay) {
            this.characterStatusOverlay = new CharacterStatusOverlay();
        }
        this.characterStatusOverlay.open(this);
    }

    private repositionConversationWindow(): void {
        this.pushConversationDebug("repositionConversationWindow", {
            isInGameScene: this.isInGameScene()
        });
        if (!this.isInGameScene()) {
            return;
        }
        const window = this.ensureConversationWindow();
        if (!window) {
            return;
        }
        const rootNode = this.getGameScene().rootNode;
        const viewportWidth = rootNode.width > 0 ? rootNode.width : this.canvas.width;
        const viewportHeight = rootNode.height > 0 ? rootNode.height : this.canvas.height;
        const targetWidth = Math.max(320, Math.min(420, Math.round(viewportWidth * 0.34)));
        const topOffset = this.shouldShowConversationMedia() ? 78 : 0;
        const targetHeight = Math.max(300, Math.min(460, viewportHeight - 32 - topOffset));
        const left = viewportWidth - 16 - targetWidth;
        const top = 16 + topOffset;
        window.setViewportLayout(left, top, targetWidth, targetHeight);
        this.repositionChatInputs();
        this.updateConversationMediaLayout();
    }

    private getConversationWindowOptions(partnerId: string, partner: { name: string; type: "agent" | "player" }): ConversationWindowDisplayOptions {
        const isAgentConversation = this.activeLLMConversation?.agent.getAgentId() === partnerId;
        const isPlayerConversation = this.activePlayerConversation?.partnerId === partnerId;
        const pending = !!this.activeLLMConversation?.pending && isAgentConversation;
        const disabled = partner.type === "agent"
            ? (!isAgentConversation || pending)
            : !isPlayerConversation;

        let statusText = "Enter to send. Shift+Enter for newline.";
        if (pending) {
            statusText = `${partner.name} is replying...`;
        } else if (partner.type === "player" && !isPlayerConversation) {
            statusText = "Conversation is visible, but sending stays disabled until the live chat is active.";
        }

        return {
            modeLabel: partner.type === "agent" ? "AI character" : "Direct conversation",
            placeholder: partner.type === "agent"
                ? `Ask ${partner.name} something...`
                : `Message ${partner.name}...`,
            submitLabel: pending ? "Waiting..." : "Send",
            statusText,
            disabled
        };
    }

    private presentConversation(partnerId: string): void {
        const partner = this.conversationPartners.get(partnerId);
        this.pushConversationDebug("presentConversation", {
            partnerId,
            hasPartner: !!partner,
            logLength: this.conversationLogs.get(partnerId)?.length ?? 0
        });
        if (!partner) {
            return;
        }
        this.ensureConversationWindow();
        const entries = this.conversationLogs.get(partnerId) ?? [];
        this.conversationWindow?.showConversation(partner.name, entries, this.getConversationWindowOptions(partnerId, partner));
    }

    private async handleConversationWindowSubmit(text: string): Promise<void> {
        if (this.activeLLMConversation) {
            await this.submitLLMConversationMessage(text);
            return;
        }
        if (this.activePlayerConversation) {
            this.submitPlayerConversationMessage(text);
        }
    }

    private handleConversationWindowClose(): void {
        this.pushConversationDebug("handleConversationWindowClose", {
            activeLLMConversation: !!this.activeLLMConversation,
            activePlayerConversation: !!this.activePlayerConversation,
            activeConversationPartner: this.activeConversationPartner
        });
        if (this.activeLLMConversation) {
            this.closeLLMConversation();
            return;
        }
        if (this.activePlayerConversation) {
            this.closePlayerConversation();
            return;
        }
        if (this.activeConversationPartner) {
            this.handleConversationClosed(this.activeConversationPartner);
        }
    }

    private focusConversation(partnerId: string, partner: { name: string; type: "agent" | "player" }): void {
        this.pushConversationDebug("focusConversation", {
            partnerId,
            partnerName: partner.name,
            partnerType: partner.type
        });
        this.ensureConversationWindow();
        this.conversationPartners.set(partnerId, partner);
        if (!this.conversationLogs.has(partnerId)) {
            this.conversationLogs.set(partnerId, []);
        }
        this.activeConversationPartner = partnerId;
        this.presentConversation(partnerId);
        this.repositionConversationWindow();
        this.updateConversationMediaLayout();
        if (partner.type === "player") {
            void this.syncStoredConversation(partnerId, partner.name);
        }
    }

    private appendConversationEntry(partnerId: string, entry: ConversationEntry): void {
        const log = this.conversationLogs.get(partnerId);
        if (!log) {
            this.conversationLogs.set(partnerId, [entry]);
        } else {
            log.push(entry);
        }
        if (this.activeConversationPartner === partnerId) {
            this.presentConversation(partnerId);
            this.repositionConversationWindow();
        }
    }

    private handleConversationClosed(partnerId: string): void {
        this.pushConversationDebug("handleConversationClosed", {
            partnerId,
            activeConversationPartner: this.activeConversationPartner
        });
        if (this.activeConversationPartner === partnerId) {
            this.activeConversationPartner = null;
            this.conversationWindow?.blurComposer();
            this.conversationWindow?.hideWindow();
        }
        this.updateConversationMediaLayout();
        this.repositionChatInputs();
    }

    private async submitLLMConversationMessage(text: string): Promise<void> {
        const conversation = this.activeLLMConversation;
        const trimmed = text.trim();
        if (!conversation || !trimmed) {
            this.conversationWindow?.focusComposer();
            return;
        }
        if (conversation.pending) {
            this.conversationWindow?.focusComposer();
            return;
        }

        const { agent, playerId } = conversation;
        const player = this.getPlayer();
        if (!player) {
            return;
        }

        const agentId = agent.getAgentId();
        const agentName = agent.getDisplayName();
        conversation.pending = true;
        this.conversationWindow?.clearComposer();
        this.presentConversation(agentId);

        const duration = this.llmService.estimateSpeechDuration(trimmed);
        player.say(trimmed, duration);
        agent.say("...", 4);

        this.appendConversationEntry(agentId, {
            senderId: playerId,
            senderName: this.userName,
            text: trimmed,
            timestamp: Date.now(),
            fromSelf: true
        });
        this.recordActivity({
            type: "agent_chat_sent",
            targetId: agentId,
            payload: {
                message: trimmed,
                agentName
            }
        });

        try {
            const response = await agent.requestResponse({
                playerId,
                playerName: this.userName,
                message: trimmed
            });
            if (this.activeLLMConversation?.agent !== agent) {
                return;
            }
            const reply = response.reply?.trim();
            if (reply) {
                agent.say(reply, this.llmService.estimateSpeechDuration(reply));
                this.appendConversationEntry(agentId, {
                    senderId: agentId,
                    senderName: agentName,
                    text: reply,
                    timestamp: Date.now(),
                    fromSelf: false
                });
                this.recordActivity({
                    type: "agent_chat_received",
                    actorId: agentId,
                    targetId: this.getCurrentUserId(),
                    payload: {
                        message: reply,
                        agentName
                    }
                });
            } else {
                agent.say("...", 2);
            }
        } catch (error) {
            console.error("LLM agent request failed", error);
            this.showNotification("LLM agent is unavailable. Please try again later.");
            agent.say("", 0);
            this.appendConversationEntry(agentId, {
                senderId: agentId,
                senderName: agentName,
                text: "(Agent unavailable)",
                timestamp: Date.now(),
                fromSelf: false
            });
        } finally {
            if (this.activeLLMConversation?.agent === agent) {
                conversation.pending = false;
                this.presentConversation(agentId);
                this.conversationWindow?.focusComposer();
            }
        }
    }

    private submitPlayerConversationMessage(text: string): void {
        const conversation = this.activePlayerConversation;
        const trimmed = text.trim();
        if (!conversation || !trimmed) {
            this.conversationWindow?.focusComposer();
            return;
        }

        const { partnerId, partnerName } = conversation;
        this.onlineService.sendDirectMessage(partnerId, trimmed);
        this.recordActivity({
            type: "player_chat_sent",
            targetId: partnerId,
            payload: {
                message: trimmed,
                displayName: partnerName,
                channel: "interaction"
            }
        });
        this.appendConversationEntry(partnerId, {
            senderId: this.getCurrentUserId(),
            senderName: this.userName,
            text: trimmed,
            timestamp: Date.now(),
            fromSelf: true
        });
        void this.persistConversationMessage({
            participantId: partnerId,
            participantName: partnerName,
            text: trimmed,
            senderId: this.getCurrentUserId(),
            senderName: this.userName
        });

        this.conversationWindow?.clearComposer();
        this.conversationWindow?.focusComposer();
    }

    private handleOutgoingPlayerChat(targetIds: string[], text: string): void {
        const trimmed = text.trim();
        if (trimmed.length === 0 || targetIds.length === 0) {
            return;
        }
        const senderId = this.getCurrentUserId();
        const timestamp = Date.now();
        targetIds.forEach((id, index) => {
            const name = this.room?.getParticipantById(id)?.getDisplayName() ?? id;
            this.recordActivity({
                type: "player_chat_sent",
                targetId: id,
                payload: {
                    message: trimmed,
                    displayName: name,
                    channel: "direct"
                }
            });
            const partnerInfo = { name, type: "player" as const };
            if (index === 0) {
                this.focusConversation(id, partnerInfo);
            } else {
                this.conversationPartners.set(id, partnerInfo);
                if (!this.conversationLogs.has(id)) {
                    this.conversationLogs.set(id, []);
                }
            }
            this.appendConversationEntry(id, {
                senderId,
                senderName: this.userName,
                text: trimmed,
                timestamp,
                fromSelf: true
            });
            void this.persistConversationMessage({
                participantId: id,
                participantName: name,
                text: trimmed,
                senderId,
                senderName: this.userName
            });
        });
    }

    private handleOutgoingBroadcastChat(text: string): void {
        const trimmed = text.trim();
        if (trimmed.length === 0) {
            return;
        }
        const partnerId = this.activeConversationPartner;
        this.recordActivity({
            type: "player_chat_sent",
            targetId: partnerId ?? undefined,
            payload: {
                message: trimmed,
                channel: partnerId ? "broadcast-focused" : "broadcast"
            }
        });
        if (!partnerId) {
            return;
        }
        const partner = this.conversationPartners.get(partnerId);
        if (!partner) {
            return;
        }
        if (!this.conversationLogs.has(partnerId)) {
            this.conversationLogs.set(partnerId, []);
        }
        this.appendConversationEntry(partnerId, {
            senderId: this.getCurrentUserId(),
            senderName: this.userName,
            text: trimmed,
            timestamp: Date.now(),
            fromSelf: true
        });
        if (partner.type === "player") {
            void this.persistConversationMessage({
                participantId: partnerId,
                participantName: partner.name,
                text: trimmed,
                senderId: this.getCurrentUserId(),
                senderName: this.userName
            });
        }
    }

    private async syncStoredConversation(partnerId: string, partnerName: string): Promise<void> {
        const requestId = (this.conversationSyncRequests.get(partnerId) ?? 0) + 1;
        this.conversationSyncRequests.set(partnerId, requestId);

        const conversation = await fetchConversation("user", partnerId, partnerName);
        if (this.conversationSyncRequests.get(partnerId) !== requestId || !conversation) {
            return;
        }

        const entries: ConversationEntry[] = conversation.messages
            .filter(message => message.senderType !== "system")
            .map(message => ({
                senderId: message.senderId,
                senderName: message.senderName ?? (message.senderId === this.getCurrentUserId() ? this.userName : partnerName),
                text: message.content,
                timestamp: Date.parse(message.createdAt) || Date.now(),
                fromSelf: message.senderId === this.getCurrentUserId()
            }));

        const mergedEntries = this.mergeConversationEntries(this.conversationLogs.get(partnerId) ?? [], entries);
        this.conversationLogs.set(partnerId, mergedEntries);
        if (this.activeConversationPartner === partnerId) {
            this.presentConversation(partnerId);
            this.repositionConversationWindow();
        }
    }

    private async persistConversationMessage(args: {
        participantId: string;
        participantName: string;
        text: string;
        senderId: string;
        senderName: string;
    }): Promise<void> {
        const conversation = await appendConversationMessage({
            participantType: "user",
            participantId: args.participantId,
            participantName: args.participantName,
            text: args.text,
            senderId: args.senderId,
            senderName: args.senderName
        });

        if (!conversation) {
            return;
        }

        const currentPartner = this.conversationPartners.get(args.participantId);
        if (currentPartner?.type === "player") {
            const entries: ConversationEntry[] = conversation.messages
                .filter(message => message.senderType !== "system")
                .map(message => ({
                    senderId: message.senderId,
                    senderName: message.senderName ?? (message.senderId === this.getCurrentUserId() ? this.userName : currentPartner.name),
                    text: message.content,
                    timestamp: Date.parse(message.createdAt) || Date.now(),
                    fromSelf: message.senderId === this.getCurrentUserId()
                }));
            const mergedEntries = this.mergeConversationEntries(this.conversationLogs.get(args.participantId) ?? [], entries);
            this.conversationLogs.set(args.participantId, mergedEntries);
            if (this.activeConversationPartner === args.participantId) {
                this.presentConversation(args.participantId);
                this.repositionConversationWindow();
            }
        }
    }

    private mergeConversationEntries(existingEntries: ConversationEntry[], incomingEntries: ConversationEntry[]): ConversationEntry[] {
        const merged = [...incomingEntries];

        existingEntries.forEach(existingEntry => {
            const alreadyPresent = merged.some(incomingEntry => this.areConversationEntriesEquivalent(incomingEntry, existingEntry));
            if (!alreadyPresent) {
                merged.push(existingEntry);
            }
        });

        merged.sort((left, right) => left.timestamp - right.timestamp);
        return merged;
    }

    private areConversationEntriesEquivalent(left: ConversationEntry, right: ConversationEntry): boolean {
        return left.senderId === right.senderId
            && left.senderName === right.senderName
            && left.text === right.text
            && Math.abs(left.timestamp - right.timestamp) <= 5000;
    }

    private positionChatInputNode(inputNode: TextInputNode<ThisIsMyDepartmentApp>): void {
        const scene = this.getGameScene();
        const rootNode = scene.rootNode;
        const margin = 16;
        const gap = 8;
        const targetX = rootNode.width - margin;
        const window = this.ensureConversationWindow();
        const windowVisible = window != null && !window.isHidden();
        const baseY = windowVisible
            ? window!.getScenePosition().y + window!.getHeight() + gap
            : margin;
        inputNode.moveTo(targetX, baseY);
    }

    private repositionChatInputs(): void {
        if (this.transientChatInput && this.transientChatInput.isInScene()) {
            this.positionChatInputNode(this.transientChatInput);
        }
    }

    private isOtherPlayerInConversationRange(partnerId: string): boolean {
        const partner = this.getOtherPlayerById(partnerId);
        const player = this.getPlayer();
        if (!partner || !player) {
            return false;
        }
        return partner.getScenePosition().getSquareDistance(player.getScenePosition()) <= 50 ** 2;
    }

    private updateConversationMediaLayout(): void {
        const videos = document.getElementById("videos");
        if (!videos) {
            return;
        }

        const activePartnerId = this.activeConversationPartner;
        const activePartner = activePartnerId ? this.conversationPartners.get(activePartnerId) : undefined;
        if (!activePartnerId || activePartner?.type !== "player") {
            videos.hidden = true;
            Array.from(videos.children).forEach(child => {
                (child as HTMLElement).hidden = false;
            });
            return;
        }

        const localVideo = document.getElementById("localUserVideo") as UserVideoElement | null;
        const showLocalVideo = !!localVideo?.isVideoEnabled();
        let remoteVideo: UserVideoElement | undefined;
        Array.from(videos.children).forEach(child => {
            if (!(child instanceof UserVideoElement) || child.id === "localUserVideo") {
                return;
            }
            if (child instanceof UserVideoElement && child.getUserName() === activePartner.name) {
                remoteVideo = child;
            }
        });
        const showRemoteVideo = remoteVideo != null && remoteVideo.isVideoEnabled();
        videos.hidden = !showLocalVideo && !showRemoteVideo;

        Array.from(videos.children).forEach(child => {
            const element = child as HTMLElement;
            const isLocalVideo = child === localVideo;
            const isRemoteVideo = child === remoteVideo;
            if (isLocalVideo) {
                element.hidden = !showLocalVideo;
                return;
            }
            if (isRemoteVideo) {
                element.hidden = !showRemoteVideo;
                return;
            }
            element.hidden = true;
        });

        if (!videos.hidden) {
            this.positionConversationMediaStrip(videos);
        }
    }

    private positionConversationMediaStrip(videos: HTMLElement): void {
        if (!this.conversationWindow || this.conversationWindow.isHidden()) {
            return;
        }

        const bounds = this.conversationWindow.getSceneBounds();
        const canvas = this.canvas;
        const canvasRect = canvas.getBoundingClientRect();
        const scaleX = canvasRect.width / canvas.width;
        const scaleY = canvasRect.height / canvas.height;
        const cssLeft = canvasRect.left + bounds.minX * scaleX;
        const cssTop = Math.max(12, canvasRect.top + bounds.minY * scaleY - 132);
        const cssWidth = Math.max(372, bounds.width * scaleX);

        videos.style.left = `${cssLeft}px`;
        videos.style.top = `${cssTop}px`;
        videos.style.width = `${cssWidth}px`;
        videos.style.maxWidth = `${cssWidth}px`;
        videos.style.transform = "none";
        videos.style.justifyContent = "space-between";
        videos.style.flexWrap = "nowrap";
        videos.style.padding = "0";
        videos.style.gap = "12px";
    }

    private shouldShowConversationMedia(): boolean {
        if (!this.activeConversationPartner) {
            return false;
        }
        return this.conversationPartners.get(this.activeConversationPartner)?.type === "player";
    }

    private refreshConversationMediaState(): void {
        if (!this.JitsiInstance) {
            return;
        }
        void this.JitsiInstance.syncConversationMedia(this.shouldShowConversationMedia())
            .finally(() => {
                this.characterStatusOverlay?.refresh();
                this.updateConversationMediaLayout();
            });
    }
}

(async () => {
    createCustomElements();
    (window as Window & { __timdConversationDebug?: Array<Record<string, unknown>> }).__timdConversationDebug = [];
    const bootstrapState = await loadBootstrapState();
    configureBackendLLMBridge();
    const game = new ThisIsMyDepartmentApp(agentDefinitions, bootstrapState);
    game["pushConversationDebug"]("main_initialized", {
        bootstrapUserId: bootstrapState.user?.userId ?? null
    });
    ThisIsMyDepartmentApp.instance = game;
    await game.scenes.setScene(LoadingScene);
    (window as any).game = game;
    game.start();
})();
