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
import { Animator } from "../engine/scene/animations/Animator";
import { FadeToBlack } from "../engine/scene/camera/FadeToBlack";
import { Direction, SimpleDirection } from "../engine/geom/Direction";
import { ControllerFamily } from "../engine/input/ControllerFamily";
import type { ScenePointerDownEvent } from "../engine/scene/events/ScenePointerDownEvent";
import { clamp } from "../engine/util/math";
import { sleep } from "../engine/util/time";
import JitsiInstance from "../Jitsi";
import JitsiConference from "../typings/Jitsi/JitsiConference";
import { HEADLINE_FONT, Layer, SMALL_FONT, STANDARD_FONT } from "./constants";
import { Dialog } from "./Dialog";
import { FxManager } from "./FxManager";
import { MusicManager } from "./MusicManager";
import { CharacterNode } from "./nodes/CharacterNode";
import { ChairNode } from "./nodes/ChairNode";
import { InteractiveNode } from "./nodes/InteractiveNode";
import { IFrameNode } from "./nodes/IFrameNode";
import { LightNode } from "./nodes/LightNode";
import { NpcNode } from "./nodes/NpcNode";
// import { NpcNode } from "./nodes/NpcNode";
import { OtherPlayerNode } from "./nodes/OtherPlayerNode";
import { PlayerNode } from "./nodes/PlayerNode";
import { PresentationBoardNode } from "./nodes/PresentationBoardNode";
import { PresentationNode } from "./nodes/PresentationNode";
import { SwitchNode } from "./nodes/SwitchNode";
import { TextInputNode } from "./nodes/TextInputNode";
import { LLMAgentNode } from "./nodes/LLMAgentNode";
import { EnvironmentPlacementPreviewNode } from "./nodes/EnvironmentPlacementPreviewNode";
import { LLMAgentService } from "./services/LLMAgentService";
import agentDefinitions from "./agents/index";
import { logActivity } from "./services/activity";
import { configureBackendLLMBridge } from "./services/backendLLMBridge";
import { loadBootstrapState } from "./services/bootstrap";
import { appendConversationMessage, fetchConversation } from "./services/conversations";
import { saveAiHostingProfile, saveAvatarProfile, saveProfilePreferences, savePublicPersonaProfile } from "./services/profile";
import { SpeechToTextService, SpeechToTextStatus } from "./services/SpeechToTextService";
import { shouldEnableJitsi } from "./runtimeConfig";
import { createEditableEnvironmentAvatar, deleteEditableEnvironmentAvatar, EditableEnvironmentAvatar, fetchEditableEnvironmentAvatars, saveEditableEnvironmentAvatar } from "./services/environmentAvatarAdmin";
import { ConversationEntry, ConversationWindow, ConversationWindowDisplayOptions } from "./ui/ConversationWindow";
import { CharacterStatusOverlay } from "./ui/CharacterStatusOverlay";
import { PresentationSessionOverlay } from "./ui/PresentationSessionOverlay";
import { SceneNavigatorOverlay, SceneNavigatorRoomEntry } from "./ui/SceneNavigatorOverlay";
import { SettingsOverlay } from "./ui/SettingsOverlay";
import { GameScene } from "./scenes/GameScene";
import { TiledTextNode } from "./nodes/TiledTextNode";
import { LoadingScene } from "./scenes/LoadingScene";
import type { LLMAgentDefinition } from "./agents/AgentDefinition";
import type { ActivityLogType } from "./services/activity";
import type { BootstrapState, CurrentUser, CurrentUserAiHostingProfile, CurrentUserProfile } from "./types/currentUser";
import type { DirectMessageEvent, EnvironmentAvatarUpsertEvent, PlayerConversationEvent, RoomInfoEvent } from "../engine/online/OnlineService";
import { AppLanguage, applyLanguageToDocument, DEFAULT_LANGUAGE, getLanguagePreference, normalizeLanguage, storeLanguagePreference, translate } from "./i18n";
import { MediaType } from "../typings/Jitsi/service/RTC/MediaType";
import { AvatarDirectoryUserSummary, fetchAvatarDirectoryUsers, spawnAvatarAgent } from "./services/avatarDirectory";

export enum GameStage {
    NONE = 0,
    START = 1,
    GAME = 2
}

interface InteractionOption {
    key: string;
    prompt: string;
    title: string;
    subtitle: string;
    activate: () => void;
}

interface LocalPresentationSession {
    boardId: number;
    slide: number;
}

interface RemotePresentationSession {
    boardId: number;
    slide: number;
    presenterId: string;
}

type SpawnedAvatarPresence = NonNullable<RoomInfoEvent["spawnedAvatars"]>[number];

type EnvironmentAvatarPlacementMode = "position" | "walk-area";

interface EnvironmentAvatarPlacementResult {
    position?: { x: number; y: number };
    walkArea?: { x: number; y: number; width: number; height: number };
}

interface EnvironmentAvatarPlacementSession {
    avatar: EditableEnvironmentAvatar;
    mode: EnvironmentAvatarPlacementMode;
    previewNode: EnvironmentPlacementPreviewNode;
    resolve: (result: EnvironmentAvatarPlacementResult | null) => void;
    dragAnchor?: { x: number; y: number };
}

type ConversationSttIndicatorTone = "neutral" | "active" | "warning" | "error";

const RIGHT_ELEVATOR_SPAWN_POINT = { x: 1488, y: 704 };
const SPAWNED_AVATAR_WANDER_SIZE = 120;
const SPAWNED_AVATAR_DESPAWN_DURATION_MS = 280;

export interface PresentationAudienceMember {
    id: string;
    displayName: string;
    audioMuted: boolean;
    videoMuted: boolean;
    role: string;
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
    public isTranscriptionEnabled: boolean = true;
    public userId: string = "anonymous-user";
    public userName: string = "anonymous";
    public sessionId: string = "local-session";

    private conversationWindow?: ConversationWindow;
    private characterStatusOverlay?: CharacterStatusOverlay;
    private presentationSessionOverlay?: PresentationSessionOverlay;
    private sceneNavigatorOverlay?: SceneNavigatorOverlay;
    private settingsOverlay?: SettingsOverlay;
    private sttService?: SpeechToTextService;
    private sttStatus: SpeechToTextStatus = "inactive";
    private interactionHint?: HTMLDivElement;
    private interactionHintText?: HTMLSpanElement;
    private interactionChooserBackdrop?: HTMLDivElement;
    private interactionChooserPanel?: HTMLDivElement;
    private interactionChooserTitle?: HTMLDivElement;
    private interactionChooserList?: HTMLDivElement;
    private interactionChooserHelp?: HTMLDivElement;
    private interactionOptions: InteractionOption[] = [];
    private interactionSelectionIndex = 0;
    private interactionOptionSignature = "";
    private activeConversationPartner: string | null = null;
    private conversationLogs = new Map<string, ConversationEntry[]>();
    private conversationPartners = new Map<string, { name: string; type: "agent" | "player" }>();
    private readonly conversationSyncRequests = new Map<string, number>();
    private readonly spawningPlayerIds = new Set<string>();
    private currentUser: CurrentUser | null = null;
    private currentUserProfile: CurrentUserProfile | null = null;
    private activityVersion = 0;
    private currentLanguage: AppLanguage = DEFAULT_LANGUAGE;
    private localPresentationSession: LocalPresentationSession | null = null;
    private readonly remotePresentationSessions = new Map<number, RemotePresentationSession>();
    private roomInitializationPromise: Promise<JitsiConference> | null = null;
    private roomInitializationError: string | null = null;
    private sceneRoomEntries: Array<SceneNavigatorRoomEntry & { x: number; y: number }> = [];
    private readonly spawnedAvatarPresences = new Map<string, SpawnedAvatarPresence>();
    private readonly spawnedAvatarNodes = new Map<string, LLMAgentNode>();
    private avatarDirectoryUsers: AvatarDirectoryUserSummary[] = [];
    private avatarDirectoryLoadPromise: Promise<void> | null = null;
    private avatarDirectoryRequestVersion = 0;
    private avatarDirectoryError: string | null = null;
    private avatarDirectoryBusyUserId: string | null = null;
    private environmentAvatarPlacementSession: EnvironmentAvatarPlacementSession | null = null;
    private readonly environmentAvatarUpdatedAt = new Map<string, string>();
    private readonly despawningEnvironmentAvatarIds = new Set<string>();
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
        this.onlineService.onRoomInfoUpdate.connect(event => {
            this.handleRoomInfoUpdate(event);
        });
        this.onlineService.onEnvironmentAvatarUpsert.connect(event => {
            this.handleEnvironmentAvatarUpsert(event);
        });
        this.onlineService.onEnvironmentAvatarDelete.connect(event => {
            this.removeEnvironmentAvatarDefinition(event.agentId);
            this.removeEnvironmentAvatarFromScene(event.agentId);
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
            void this.ensureRealtimeMediaRoom();
        }
        // Assets cannot be loaded in constructor because the LoadingScene
        // is not initialized at constructor time and Assets are loaded in the LoadingScene
        this.dialogs = [
            new Dialog(ThisIsMyDepartmentApp.trainDialog)
        ];

        this.input.onButtonUp.filter(e => e.isPlayerChat).connect(() => this.handleChat(), this);

        this.keyboard.onKeyPress.filter(ev => ev.key === "9" && ev.ctrlKey).connect((ev) => { ev.preventDefault(); this.preventPlayerInteraction = 0;});

        this.input.onDrag.filter(e => e.isRightStick && !!e.direction && e.direction.getLength() > 0.3).connect(this.getPlayer().handleControllerInput, this.getPlayer());

        this.initializeHudUi();
    }

    private initializeHudUi(): void {
        try {
            this.ensureConversationWindow();
            this.repositionConversationWindow();
        } catch (error) {
            console.error("Conversation UI initialization failed", error);
        }

        try {
            this.ensureCharacterStatusOverlay();
        } catch (error) {
            console.error("Character status UI initialization failed", error);
        }

        try {
            this.ensureSceneNavigatorOverlay();
        } catch (error) {
            console.error("Scene navigator UI initialization failed", error);
        }

        try {
            this.ensureInteractionHint();
            this.ensureInteractionChooser();
        } catch (error) {
            console.error("Interaction HUD initialization failed", error);
        }

        if (!this.sttService) {
            this.sttService = new SpeechToTextService();
            this.sttService.setStatusCallback(status => {
                this.sttStatus = status;
                this.refreshConversationStatusIndicator();
            });
            this.sttService.setCallback(({ text, capturedAt }) => {
                const speechText = `[语音] ${text}`;

                if (this.activeLLMConversation) {
                    void this.submitLLMConversationMessage(speechText, { suppressSceneSpeech: true });
                    return;
                }
                if (this.activePlayerConversation) {
                    this.submitPlayerConversationMessage(speechText);
                    return;
                }
                this.getPlayer().say(text, Math.max(3, text.length * 0.2)); 
            });
        }
        this.rebuildSceneRoomDirectory();
        this.syncSpawnedAvatarRoster(Array.from(this.spawnedAvatarPresences.values()));
        void this.refreshAvatarDirectory();
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
            walkArea: agent.walkArea,
            spawnByDefault: agent.spawnByDefault
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
        this.applyLanguage(getLanguagePreference(this.currentUserProfile));
    }

    public getLanguage(): AppLanguage {
        return this.currentLanguage;
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
        const mediaControls = this.ensureMediaControls();
        const enabled = mediaControls.toggleLocalAudio();
        this.refreshConversationMediaState();
        this.refreshConversationStatusIndicator();
        this.syncSpeechToTextCaptureState();
        this.characterStatusOverlay?.refresh();
        return enabled;
    }

    public toggleLocalVideo(): boolean {
        const mediaControls = this.ensureMediaControls();
        const enabled = mediaControls.toggleLocalVideo();
        this.refreshConversationMediaState();
        this.characterStatusOverlay?.refresh();
        this.updateConversationMediaLayout();
        return enabled;
    }

    public isPresentationScreenShareActive(): boolean {
        return !!this.room?.getLocalVideoTrack()?.isScreenSharing?.();
    }

    public getPresentationMediaUnavailableReason(): string | null {
        if (!shouldEnableJitsi()) {
            const hostname = window.location.hostname.toLowerCase();
            if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "0.0.0.0") {
                return this.t("presentation.controls.errors.localJitsiDisabled");
            }
            return this.t("presentation.controls.errors.mediaUnavailable");
        }

        return this.roomInitializationError;
    }

    public async togglePresentationScreenShare(): Promise<void> {
        await this.ensureRealtimeMediaRoom();
        this.ensureMediaControls().switchVideo();
    }

    public getPresentationAudience(): PresentationAudienceMember[] {
        const participants = this.room?.getParticipants() ?? [];
        return participants
            .map(participant => ({
                id: participant.getId(),
                displayName: participant.getDisplayName() || participant.getId(),
                audioMuted: participant.isAudioMuted(),
                videoMuted: participant.isVideoMuted(),
                role: participant.getRole()
            }))
            .sort((left, right) => left.displayName.localeCompare(right.displayName));
    }

    public canModeratePresentationAudience(): boolean {
        return this.room?.isModerator() === true;
    }

    public async mutePresentationAudience(): Promise<number> {
        await this.ensureRealtimeMediaRoom();
        if (!this.canModeratePresentationAudience()) {
            throw new Error(this.t("presentation.controls.errors.moderatorRequired"));
        }

        const audience = this.getPresentationAudience();
        audience.forEach(member => {
            this.room?.muteParticipant(member.id, MediaType.AUDIO);
        });
        return audience.length;
    }

    public requestPresentationAudienceUnmute(): number {
        const audience = this.getPresentationAudience();
        this.sendCommand("presentationAudienceUnmuteRequest", {
            presenterName: this.userName,
            count: audience.length
        });
        return audience.length;
    }

    public openPresentationSessionOverlay(): void {
        if (!this.presentationSessionOverlay) {
            this.presentationSessionOverlay = new PresentationSessionOverlay();
        }
        this.presentationSessionOverlay.open(this);
    }

    public closePresentationSessionOverlay(): void {
        this.presentationSessionOverlay?.close();
        this.presentationSessionOverlay = undefined;
    }

    public async setLocalAudioEnabled(enabled: boolean): Promise<boolean> {
        const mediaControls = this.ensureMediaControls();
        if (enabled === mediaControls.isLocalAudioEnabled()) {
            return enabled;
        }

        if (enabled) {
            await this.requestDevicePermission({ audio: true, video: false });
        }

        mediaControls.setLocalAudioEnabled(enabled);
        await this.syncConversationMediaState();
        this.refreshConversationStatusIndicator();
        this.syncSpeechToTextCaptureState();
        this.characterStatusOverlay?.refresh();
        return mediaControls.isLocalAudioEnabled();
    }
    public toggleTranscriptionSetting(enable: boolean): void {
        this.isTranscriptionEnabled = enable;
        this.syncSpeechToTextCaptureState();
        this.refreshConversationStatusIndicator();
    }
    public async setLocalVideoEnabled(enabled: boolean): Promise<boolean> {
        const mediaControls = this.ensureMediaControls();
        if (enabled === mediaControls.isLocalVideoEnabled()) {
            return enabled;
        }

        if (enabled) {
            await this.requestDevicePermission({ audio: false, video: true });
        }

        mediaControls.setLocalVideoEnabled(enabled);
        await this.syncConversationMediaState();
        this.characterStatusOverlay?.refresh();
        this.updateConversationMediaLayout();
        return mediaControls.isLocalVideoEnabled();
    }

    public openSettingsOverlay(initialTab: "media" | "language" | "character" | "ai-prompt" = "media"): void {
        if (!this.settingsOverlay) {
            this.settingsOverlay = new SettingsOverlay();
        }

        this.settingsOverlay.open({
            initialTab,
            currentUser: this.currentUser ?? undefined,
            initialLanguage: this.currentLanguage,
            initialSpriteIndex: this.currentUserProfile?.avatar?.spriteIndex ?? this.initialPlayerSprite,
            initialPublicPersona: this.currentUserProfile?.publicPersona,
            initialAiHosting: this.currentUserProfile?.aiHosting,
            initialAudioEnabled: this.isLocalAudioEnabled(),
            initialVideoEnabled: this.isLocalVideoEnabled(),
            canManageEnvironmentAvatars: this.currentUser?.roles?.includes("admin"),
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
            onPublicPersonaSave: async publicPersona => {
                await this.saveOwnPublicPersona(publicPersona.additionalDescription ?? "");
            },
            onAiHostingSave: async aiHosting => {
                await this.saveOwnAiHostingProfile(aiHosting);
            },
            onLanguageSave: async (language: AppLanguage) => {
                await this.saveLanguagePreference(language);
            },
            loadEnvironmentAvatars: async () => {
                return this.loadEditableEnvironmentAvatars();
            },
            onEnvironmentAvatarCreate: async seed => {
                return this.createEnvironmentAvatarConfiguration(seed);
            },
            onEnvironmentAvatarSave: async avatar => {
                return this.saveEnvironmentAvatarConfiguration(avatar);
            },
            onEnvironmentAvatarDelete: async agentId => {
                return this.deleteEnvironmentAvatarConfiguration(agentId);
            },
            onEnvironmentAvatarPlacementStart: async (avatar, mode) => {
                return this.beginEnvironmentAvatarPlacement(avatar, mode);
            },
            onEnvironmentAvatarPlacementCancel: () => {
                this.cancelEnvironmentAvatarPlacement();
            },
            onMediaToggle: async (kind, enabled) => {
                if (kind === "audioinput") {
                    return this.setLocalAudioEnabled(enabled);
                }
                return this.setLocalVideoEnabled(enabled);
            },
            onMediaDeviceChange: async (kind, deviceId) => {
                const mediaControls = this.ensureMediaControls();
                if (kind === "audiooutput") {
                    mediaControls.changeAudioOutput(deviceId);
                    return;
                }
                if (kind === "audioinput") {
                    mediaControls.changeAudioInput(deviceId);
                    return;
                }
                mediaControls.changeVideoInput(deviceId);
            }
        });
    }

    private ensureMediaControls(): JitsiInstance {
        if (!this.JitsiInstance) {
            this.JitsiInstance = new JitsiInstance();
        }

        return this.JitsiInstance;
    }

    private async ensureRealtimeMediaRoom(): Promise<JitsiConference> {
        const unavailableReason = this.getPresentationMediaUnavailableReason();
        if (unavailableReason) {
            throw new Error(unavailableReason);
        }

        if (this.room) {
            return this.room;
        }

        if (!this.roomInitializationPromise) {
            const mediaControls = this.ensureMediaControls();
            this.roomInitializationError = null;
            this.roomInitializationPromise = Promise.race<JitsiConference>([
                mediaControls.create(),
                new Promise<JitsiConference>((_resolve, reject) => {
                    window.setTimeout(() => reject(new Error(this.t("presentation.controls.errors.jitsiInitTimeout"))), 12000);
                })
            ]).then(room => {
                this.room = room;
                this.room.setDisplayName(this.userName);
                this.room.addCommandListener("presentationAudienceUnmuteRequest", values => {
                    const parsedObj = JSON.parse(values.value);
                    if (parsedObj.id !== this.room?.myUserId()) {
                        this.handlePresentationAudienceUnmuteRequest(parsedObj);
                    }
                });
                this.recordActivity({
                    type: "room_joined",
                    payload: {
                        roomId: room.getName?.() ?? "unknown-room"
                    }
                });
                return room;
            }).catch(error => {
                console.warn("Jitsi initialization failed", error);
                this.room = null;
                this.roomInitializationPromise = null;
                const message = error instanceof Error && error.message
                    ? error.message
                    : String(error ?? this.t("presentation.controls.errors.mediaUnavailable"));
                this.roomInitializationError = this.t("presentation.controls.errors.jitsiInitFailed", { message });
                throw new Error(this.roomInitializationError);
            });
        }

        return this.roomInitializationPromise;
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

        this.showNotification(this.t("profile.avatarSaved"));
    }

    private async saveOwnPublicPersona(additionalDescription: string): Promise<void> {
        const result = await savePublicPersonaProfile({
            additionalDescription
        });
        if (!result) {
            throw new Error("Character profile update failed.");
        }
        this.setCurrentUserProfile(result.profile);
        this.showNotification(this.t("profile.publicPersonaSaved"));
    }

    private async saveOwnAiHostingProfile(aiHosting: CurrentUserAiHostingProfile): Promise<void> {
        const result = await saveAiHostingProfile(aiHosting);
        if (!result) {
            throw new Error("AI hosting profile update failed.");
        }
        this.setCurrentUserProfile(result.profile);
        const hasConfiguredFields = [
            aiHosting.coreIdentity,
            aiHosting.speakingStyle,
            aiHosting.interactionGoals,
            aiHosting.relationshipGuidance,
            aiHosting.boundaries,
            aiHosting.additionalInstructions
        ].some(value => (value ?? "").trim().length > 0);
        this.showNotification(hasConfiguredFields ? this.t("profile.aiHostingSaved") : this.t("profile.aiHostingCleared"));
    }

    private async saveLanguagePreference(language: AppLanguage): Promise<void> {
        const nextLanguage = normalizeLanguage(language);
        storeLanguagePreference(nextLanguage);
        const result = await saveProfilePreferences({
            language: nextLanguage
        });

        if (result) {
            this.setCurrentUserProfile(result.profile);
        } else if (this.currentUserProfile) {
            this.setCurrentUserProfile({
                ...this.currentUserProfile,
                preferences: {
                    ...(this.currentUserProfile.preferences ?? {}),
                    language: nextLanguage
                }
            });
        }

        this.applyLanguage(nextLanguage);
    }

    private async loadEditableEnvironmentAvatars(): Promise<EditableEnvironmentAvatar[]> {
        const avatars = await fetchEditableEnvironmentAvatars();
        return avatars.slice().sort((left, right) => left.displayName.localeCompare(right.displayName));
    }

    private async createEnvironmentAvatarConfiguration(seed?: Partial<EditableEnvironmentAvatar>): Promise<EditableEnvironmentAvatar> {
        const defaultPosition = this.isInGameScene()
            ? {
                x: this.roundSceneCoordinate(this.getPlayer().getX()),
                y: this.roundSceneCoordinate(this.getPlayer().getY())
            }
            : { x: 128, y: 1088 };
        const position = seed?.position ? { ...seed.position } : defaultPosition;
        const walkArea = seed?.walkArea
            ? { ...seed.walkArea }
            : { x: position.x, y: position.y, width: 80, height: 80 };
        const createdAvatar = await createEditableEnvironmentAvatar({
            displayName: seed?.displayName?.trim() || "New environment avatar",
            spriteIndex: seed?.spriteIndex ?? 0,
            caption: seed?.caption ?? "Press E to chat",
            defaultSystemPrompt: seed?.defaultSystemPrompt ?? "",
            position,
            walkArea,
            spawnByDefault: seed?.spawnByDefault ?? true,
            characterRole: seed?.characterRole ?? "custom"
        });

        if (!createdAvatar) {
            throw new Error("Environment avatar creation failed.");
        }

        this.upsertEnvironmentAvatarDefinition(createdAvatar);
        this.refreshEnvironmentAvatarInScene(createdAvatar);
        this.showNotification(`${createdAvatar.displayName} created.`);
        return createdAvatar;
    }

    private async saveEnvironmentAvatarConfiguration(avatar: EditableEnvironmentAvatar): Promise<EditableEnvironmentAvatar> {
        const savedAvatar = await saveEditableEnvironmentAvatar(avatar);
        if (!savedAvatar) {
            throw new Error("Environment avatar update failed.");
        }

        this.upsertEnvironmentAvatarDefinition(savedAvatar);
        this.refreshEnvironmentAvatarInScene(savedAvatar);
        this.showNotification(`${savedAvatar.displayName} updated.`);
        return savedAvatar;
    }

    private async deleteEnvironmentAvatarConfiguration(agentId: string): Promise<void> {
        const deleted = await deleteEditableEnvironmentAvatar(agentId);
        if (!deleted) {
            throw new Error("Environment avatar deletion failed.");
        }

        this.removeEnvironmentAvatarDefinition(agentId);
        this.removeEnvironmentAvatarFromScene(agentId);
    }

    private async beginEnvironmentAvatarPlacement(
        avatar: EditableEnvironmentAvatar,
        mode: EnvironmentAvatarPlacementMode
    ): Promise<EnvironmentAvatarPlacementResult | null> {
        if (!this.isInGameScene()) {
            throw new Error("Environment avatar placement is only available inside the scene.");
        }

        this.cancelEnvironmentAvatarPlacement();

        return new Promise<EnvironmentAvatarPlacementResult | null>(resolve => {
            const previewNode = new EnvironmentPlacementPreviewNode({
                spriteIndex: avatar.spriteIndex,
                displayName: avatar.displayName,
                position: { ...avatar.position },
                walkArea: avatar.walkArea ? { ...avatar.walkArea } : undefined,
                mode
            });
            previewNode.appendTo(this.getGameScene().rootNode);

            this.environmentAvatarPlacementSession = {
                avatar: {
                    ...avatar,
                    position: { ...avatar.position },
                    walkArea: avatar.walkArea ? { ...avatar.walkArea } : undefined
                },
                mode,
                previewNode,
                resolve
            };

            this.getGameScene().onPointerDown.connect(this.handleEnvironmentAvatarPlacementPointerDown, this);
            this.getGameScene().onPointerMove.connect(this.handleEnvironmentAvatarPlacementPointerMove, this);
            this.preventPlayerInteraction += 1;
            this.canvas.style.cursor = mode === "position" ? "grabbing" : "crosshair";
        });
    }

    private cancelEnvironmentAvatarPlacement(): void {
        this.finishEnvironmentAvatarPlacement(null);
    }

    private handleEnvironmentAvatarPlacementPointerDown(event: ScenePointerDownEvent<ThisIsMyDepartmentApp>): void {
        const session = this.environmentAvatarPlacementSession;
        if (!session || event.getButton() !== 0) {
            return;
        }

        if (session.mode === "position") {
            this.updateEnvironmentPlacementPreviewPosition(event.getX(), event.getY());
            event.onPointerEnd.connect((endEvent: { getX(): number; getY(): number }) => {
                const position = {
                    x: this.roundSceneCoordinate(endEvent.getX()),
                    y: this.roundSceneCoordinate(endEvent.getY())
                };
                session.previewNode.setAvatarPosition(position);
                this.finishEnvironmentAvatarPlacement({ position });
            });
            return;
        }

        const anchor = {
            x: event.getX(),
            y: event.getY()
        };
        session.dragAnchor = anchor;
        this.updateEnvironmentPlacementPreviewWalkArea(anchor.x, anchor.y);
        event.onPointerEnd.connect((endEvent: { getX(): number; getY(): number }) => {
            const walkArea = this.normalizeEnvironmentWalkArea(anchor, {
                x: endEvent.getX(),
                y: endEvent.getY()
            });
            session.previewNode.setPendingWalkArea(walkArea);
            session.dragAnchor = undefined;
            this.finishEnvironmentAvatarPlacement({ walkArea });
        });
    }

    private handleEnvironmentAvatarPlacementPointerMove(event: { getX(): number; getY(): number }): void {
        const session = this.environmentAvatarPlacementSession;
        if (!session) {
            return;
        }

        if (session.mode === "position") {
            this.updateEnvironmentPlacementPreviewPosition(event.getX(), event.getY());
            return;
        }

        this.updateEnvironmentPlacementPreviewWalkArea(event.getX(), event.getY());
    }

    private updateEnvironmentPlacementPreviewPosition(x: number, y: number): void {
        const session = this.environmentAvatarPlacementSession;
        if (!session) {
            return;
        }

        session.previewNode.setAvatarPosition({
            x: this.roundSceneCoordinate(x),
            y: this.roundSceneCoordinate(y)
        });
    }

    private updateEnvironmentPlacementPreviewWalkArea(x: number, y: number): void {
        const session = this.environmentAvatarPlacementSession;
        if (!session) {
            return;
        }

        if (session.dragAnchor) {
            session.previewNode.setPendingWalkArea(this.normalizeEnvironmentWalkArea(session.dragAnchor, { x, y }));
            return;
        }

        session.previewNode.setPendingWalkArea(undefined);
    }

    private finishEnvironmentAvatarPlacement(result: EnvironmentAvatarPlacementResult | null): void {
        const session = this.environmentAvatarPlacementSession;
        if (!session || !this.isInGameScene()) {
            return;
        }

        this.getGameScene().onPointerDown.disconnect(this.handleEnvironmentAvatarPlacementPointerDown, this);
        this.getGameScene().onPointerMove.disconnect(this.handleEnvironmentAvatarPlacementPointerMove, this);
        session.previewNode.remove();
        this.environmentAvatarPlacementSession = null;
        this.preventPlayerInteraction = clamp(this.preventPlayerInteraction - 1, 0, Infinity);
        this.canvas.style.cursor = "";
        session.resolve(result);
    }

    private normalizeEnvironmentWalkArea(
        start: { x: number; y: number },
        end: { x: number; y: number }
    ): { x: number; y: number; width: number; height: number } {
        let minX = Math.min(start.x, end.x);
        let minY = Math.min(start.y, end.y);
        let width = Math.abs(end.x - start.x);
        let height = Math.abs(end.y - start.y);

        if (width < 24) {
            if (end.x < start.x) {
                minX = start.x - 24;
            }
            width = 24;
        }
        if (height < 24) {
            if (end.y < start.y) {
                minY = start.y - 24;
            }
            height = 24;
        }

        return {
            x: this.roundSceneCoordinate(minX),
            y: this.roundSceneCoordinate(minY),
            width: this.roundSceneCoordinate(width),
            height: this.roundSceneCoordinate(height)
        };
    }

    private roundSceneCoordinate(value: number): number {
        return Math.round(value * 100) / 100;
    }

    private upsertEnvironmentAvatarDefinition(avatar: EditableEnvironmentAvatar): void {
        if (avatar.updatedAt) {
            this.environmentAvatarUpdatedAt.set(avatar.agentId, avatar.updatedAt);
        }
        const nextDefinition: LLMAgentDefinition = {
            id: `agent-${avatar.agentId}`,
            agentId: avatar.agentId,
            displayName: avatar.displayName,
            spriteIndex: avatar.spriteIndex,
            position: { ...avatar.position },
            caption: avatar.caption,
            systemPrompt: avatar.defaultSystemPrompt,
            provider: avatar.provider,
            model: avatar.model,
            walkArea: avatar.walkArea ? { ...avatar.walkArea } : undefined,
            spawnByDefault: avatar.spawnByDefault
        };

        const definitionIndex = this.agentDefinitions.findIndex(definition => definition.agentId === avatar.agentId);
        if (definitionIndex >= 0) {
            this.agentDefinitions.splice(definitionIndex, 1, nextDefinition);
            return;
        }

        this.agentDefinitions.push(nextDefinition);
    }

    private removeEnvironmentAvatarDefinition(agentId: string): void {
        this.environmentAvatarUpdatedAt.delete(agentId);
        const definitionIndex = this.agentDefinitions.findIndex(definition => definition.agentId === agentId);
        if (definitionIndex >= 0) {
            this.agentDefinitions.splice(definitionIndex, 1);
        }
    }

    private removeEnvironmentAvatarFromScene(agentId: string): void {
        if (!this.isInGameScene()) {
            return;
        }

        const sceneRoot = this.getGameScene().rootNode;
        const existingNode = sceneRoot.getDescendantsByType<LLMAgentNode>(LLMAgentNode)
            .find(node => node.getAgentId() === agentId);

        if (existingNode) {
            if (this.activeLLMConversation?.agent === existingNode) {
                this.closeLLMConversation(existingNode);
            }
            this.animateEnvironmentAvatarDespawn(existingNode);
        }
    }

    private handleEnvironmentAvatarUpsert(avatar: EnvironmentAvatarUpsertEvent): void {
        if (!avatar.agentId || avatar.ownerUserId) {
            return;
        }

        const knownUpdatedAt = this.environmentAvatarUpdatedAt.get(avatar.agentId);
        if (knownUpdatedAt && avatar.updatedAt && knownUpdatedAt === avatar.updatedAt) {
            return;
        }

        const syncedAvatar: EditableEnvironmentAvatar = {
            agentId: avatar.agentId,
            displayName: avatar.displayName,
            spriteIndex: avatar.spriteIndex,
            caption: avatar.caption,
            defaultSystemPrompt: avatar.defaultSystemPrompt,
            position: { ...avatar.position },
            walkArea: avatar.walkArea ? { ...avatar.walkArea } : undefined,
            characterRole: avatar.characterRole,
            spawnByDefault: avatar.spawnByDefault,
            provider: avatar.provider,
            model: avatar.model,
            updatedAt: avatar.updatedAt
        };

        this.upsertEnvironmentAvatarDefinition(syncedAvatar);
        this.refreshEnvironmentAvatarInScene(syncedAvatar);
    }

    private refreshEnvironmentAvatarInScene(avatar: EditableEnvironmentAvatar): void {
        if (!this.isInGameScene()) {
            return;
        }

        if (this.despawningEnvironmentAvatarIds.has(avatar.agentId)) {
            return;
        }

        const sceneRoot = this.getGameScene().rootNode;
        const existingNode = sceneRoot.getDescendantsByType<LLMAgentNode>(LLMAgentNode)
            .find(node => node.getAgentId() === avatar.agentId);

        const spawnReplacement = () => {
            this.despawningEnvironmentAvatarIds.delete(avatar.agentId);
            if (avatar.spawnByDefault === false) {
                return;
            }

            const agentNode = this.createEnvironmentAvatarSceneNode(avatar);
            agentNode.moveTo(avatar.position.x, avatar.position.y).appendTo(sceneRoot);
            this.animateEnvironmentAvatarSpawn(agentNode);
        };

        if (existingNode) {
            if (this.activeLLMConversation?.agent === existingNode) {
                this.closeLLMConversation(existingNode);
            }
            this.despawningEnvironmentAvatarIds.add(avatar.agentId);
            this.animateEnvironmentAvatarDespawn(existingNode, spawnReplacement);
            return;
        }

        spawnReplacement();
    }

    private createEnvironmentAvatarSceneNode(avatar: EditableEnvironmentAvatar): LLMAgentNode {
        return new LLMAgentNode({
            id: `agent-${avatar.agentId}`,
            agentId: avatar.agentId,
            spriteIndex: avatar.spriteIndex,
            displayName: avatar.displayName,
            caption: avatar.caption,
            systemPrompt: avatar.defaultSystemPrompt,
            walkArea: avatar.walkArea
        });
    }

    private animateEnvironmentAvatarSpawn(node: LLMAgentNode): void {
        this.emitSpawnedAvatarDespawnParticles(node);
        node.setOpacity(0);
        node.addAnimation(new Animator((target, value) => {
            target.setOpacity(value);
        }, { duration: SPAWNED_AVATAR_DESPAWN_DURATION_MS / 1000 }));
    }

    private animateEnvironmentAvatarDespawn(node: LLMAgentNode, onComplete?: () => void): void {
        node.setNavigation({});
        node.setDirection(SimpleDirection.NONE);
        this.emitSpawnedAvatarDespawnParticles(node);

        const startOpacity = node.getOpacity();
        node.addAnimation(new Animator((target, value) => {
            target.setOpacity(startOpacity * (1 - value));
        }, { duration: SPAWNED_AVATAR_DESPAWN_DURATION_MS / 1000 }));

        window.setTimeout(() => {
            node.remove();
            onComplete?.();
        }, SPAWNED_AVATAR_DESPAWN_DURATION_MS + 40);
    }

    private emitSpawnedAvatarDespawnParticles(_node: LLMAgentNode): void {
        // The STT PR does not depend on the avatar despawn particle effect.
        // Keep this as a no-op so the branch compiles while preserving call sites.
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

    private async requestDevicePermission(constraints: MediaStreamConstraints): Promise<void> {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("This browser does not support microphone or camera access.");
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach(track => track.stop());
    }

    private getDeviceDisplayLabel(device: MediaDeviceInfo, index: number): string {
        const label = device.label?.trim();
        if (label) {
            return label;
        }
        if (device.deviceId === "default") {
            if (device.kind === "audioinput") {
                return `${this.t("settings.media.audioinput")} (Default)`;
            }
            if (device.kind === "audiooutput") {
                return `${this.t("settings.media.audiooutput")} (Default)`;
            }
            return `${this.t("settings.media.videoinput")} (Default)`;
        }
        if (device.kind === "audioinput") {
            return this.t("device.fallback.audioinput", { index });
        }
        if (device.kind === "audiooutput") {
            return this.t("device.fallback.audiooutput", { index });
        }
        return this.t("device.fallback.videoinput", { index });
    }

    public t(key: string, params?: Record<string, string | number>): string {
        return translate(this.currentLanguage, key, params);
    }

    private applyLanguage(language: AppLanguage): void {
        const nextLanguage = normalizeLanguage(language);
        const hasChanged = nextLanguage !== this.currentLanguage;
        this.currentLanguage = nextLanguage;
        applyLanguageToDocument(nextLanguage);
        if (hasChanged) {
            this.refreshLocalizedUi();
        }
    }

    private refreshLocalizedUi(): void {
        this.conversationWindow?.setLanguage(this.currentLanguage);
        if (this.activeConversationPartner) {
            this.presentConversation(this.activeConversationPartner);
        }

        if (this.characterStatusOverlay) {
            this.characterStatusOverlay.close();
            this.characterStatusOverlay = undefined;
            this.ensureCharacterStatusOverlay();
        }

        this.presentationSessionOverlay?.refresh();
        this.sceneNavigatorOverlay?.setLanguage(this.currentLanguage);

        if (this.isInteractionChooserOpen()) {
            this.interactionChooserHelp!.textContent = this.t("interaction.chooser.help");
            this.syncInteractionChooserOptions();
            this.renderInteractionChooser();
        }

        this.rebuildSceneRoomDirectory();
        this.syncSpawnedAvatarRoster(Array.from(this.spawnedAvatarPresences.values()), true);
        this.refreshSceneNavigatorOverlay();
        this.updateInteractionHint();
    }

    private cloneCurrentUserProfile(profile: CurrentUserProfile | null): CurrentUserProfile | null {
        if (!profile) {
            return null;
        }

        return {
            ...profile,
            avatar: profile.avatar ? { ...profile.avatar } : undefined,
            publicPersona: profile.publicPersona ? { ...profile.publicPersona } : undefined,
            aiHosting: profile.aiHosting ? { ...profile.aiHosting } : undefined,
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

    public sendRealtimeCommand(eventName: string, value: any): void {
        const userId = this.room?.myUserId();
        if (userId != null) {
            this.room?.sendCommand(eventName, { value: JSON.stringify({ ...value, spriteIndex: this.getPlayer().spriteIndex, id: userId }) });
        }
    }

    public showNotification(str: string): void {
        if (this.isInGameScene()) {
            this.getGameScene().notificationNode?.showNotification(str);
        }
    }

    public beginLocalPresentation(boardId: number, slide: number): void {
        this.localPresentationSession = { boardId, slide };
    }

    public updateLocalPresentationSlide(boardId: number, slide: number): void {
        if (!this.localPresentationSession || this.localPresentationSession.boardId !== boardId) {
            this.localPresentationSession = { boardId, slide };
            return;
        }
        this.localPresentationSession.slide = slide;
    }

    public endLocalPresentation(boardId: number): void {
        if (this.localPresentationSession?.boardId === boardId) {
            this.localPresentationSession = null;
        }
    }

    public rebroadcastLocalPresentationState(): void {
        if (!this.localPresentationSession) {
            return;
        }
        this.sendRealtimeCommand("presentationUpdate", {
            presentationBoardId: this.localPresentationSession.boardId,
            slide: this.localPresentationSession.slide
        });
    }

    public isPresentationSessionActive(boardId: number | undefined): boolean {
        if (boardId == null) {
            return false;
        }
        return this.localPresentationSession?.boardId === boardId || this.remotePresentationSessions.has(boardId);
    }

    public getPresentationSessionSlide(boardId: number | undefined): number | null {
        if (boardId == null) {
            return null;
        }
        if (this.localPresentationSession?.boardId === boardId) {
            return this.localPresentationSession.slide;
        }
        return this.remotePresentationSessions.get(boardId)?.slide ?? null;
    }

    private handlePresentationAudienceUnmuteRequest(args: { id: string; presenterName?: string; count?: number }): void {
        const presenterName = args.presenterName?.trim()
            || this.room?.getParticipantById(args.id)?.getDisplayName()
            || this.t("interaction.subtitle.presentation");
        this.showNotification(this.t("presentation.controls.notifications.requestedUnmute", { name: presenterName }));
    }

    public handleOtherPlayerPresentationUpdate(args: { presentationBoardId: number, slide: number; id: string}): void {
        const presentationBoard = this.getGameScene()?.rootNode.getDescendantsByType<PresentationBoardNode>(PresentationBoardNode)
            .find(n => n.boardId === args.presentationBoardId);
        if (args.slide === -1) {
            this.remotePresentationSessions.delete(args.presentationBoardId);
            this.getCamera().focus(this.getPlayer(), { duration: 0, follow: true });
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
            this.remotePresentationSessions.set(args.presentationBoardId, {
                boardId: args.presentationBoardId,
                slide: args.slide,
                presenterId: args.id
            });
            presentationBoard.setSlide(args.slide);
        } else if (presentationBoard != null) {
            this.remotePresentationSessions.set(args.presentationBoardId, {
                boardId: args.presentationBoardId,
                slide: args.slide,
                presenterId: args.id
            });
            this.showNotification((this.room?.getParticipantById(args.id).getDisplayName() ?? "anonymous") + " started to present");
            this.getCamera().focus(presentationBoard, { duration: 0, follow: true }).then((successful) => {
                if (successful) {
                    presentationBoard?.startPresentation(args.slide, false);
                    presentationBoard?.setSlide(args.slide);
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
        this.touchSpawnedAvatarAgent(agentId);
        this.focusConversation(agentId, { name: agentName, type: "agent" });
        this.syncSpeechToTextCaptureState();
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
        this.syncSpeechToTextCaptureState();
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
        this.syncSpeechToTextCaptureState();
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
        this.syncSpeechToTextCaptureState();
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
        player.syncCharacterState(true);
        MusicManager.getInstance().loopTrack(0);
        FxManager.getInstance().playSounds();
        this.rebuildSceneRoomDirectory();
        this.syncSpawnedAvatarRoster(Array.from(this.spawnedAvatarPresences.values()));
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
        return this.findNearbyOtherPlayers()[0] ?? null;
    }

    public findNearbyOtherPlayers(): OtherPlayerNode[] {
        const player = this.getPlayer();
        const playerPos = player.getScenePosition();
        const range = 50;
        return Object.values(this.players)
            .map(otherPlayer => ({
                otherPlayer,
                distance: otherPlayer.getScenePosition().getSquareDistance(playerPos)
            }))
            .filter(entry => entry.distance <= range ** 2)
            .sort((left, right) => left.distance - right.distance)
            .map(entry => entry.otherPlayer);
    }

    private ensureInteractionHint(): void {
        if (this.interactionHint) {
            return;
        }

        const hint = document.createElement("div");
        const key = document.createElement("span");
        const text = document.createElement("span");
        hint.hidden = true;
        hint.className = "timd-interaction-hint";
        key.className = "timd-interaction-hint__key";
        key.textContent = this.getPrimaryInteractionKeyLabel();
        text.className = "timd-interaction-hint__text";
        hint.append(key, text);
        document.body.appendChild(hint);
        this.interactionHint = hint;
        this.interactionHintText = text;
    }

    private ensureInteractionChooser(): void {
        if (this.interactionChooserBackdrop && this.interactionChooserPanel && this.interactionChooserList && this.interactionChooserTitle && this.interactionChooserHelp) {
            return;
        }

        const backdrop = document.createElement("div");
        backdrop.hidden = true;
        backdrop.className = "timd-interaction-chooser-backdrop";
        backdrop.addEventListener("click", () => this.closeInteractionChooser());

        const panel = document.createElement("div");
        panel.hidden = true;
        panel.className = "timd-interaction-chooser";
        panel.addEventListener("click", event => event.stopPropagation());

        const title = document.createElement("div");
        title.className = "timd-interaction-chooser__title";

        const help = document.createElement("div");
        help.className = "timd-interaction-chooser__help";

        const list = document.createElement("div");
        list.className = "timd-interaction-chooser__list";

        panel.append(title, help, list);
        document.body.append(backdrop, panel);

        this.interactionChooserBackdrop = backdrop;
        this.interactionChooserPanel = panel;
        this.interactionChooserTitle = title;
        this.interactionChooserHelp = help;
        this.interactionChooserList = list;
    }

    private updateInteractionHint(): void {
        if (!this.interactionHint || !this.interactionHintText || !this.isInGameScene()) {
            return;
        }

        if (this.isInteractionChooserOpen()) {
            this.syncInteractionChooserOptions();
            this.interactionHint.hidden = true;
            return;
        }

        if (this.activeConversationPartner || this.currentDialog) {
            this.interactionHint.hidden = true;
            return;
        }

        const options = this.buildNearbyInteractionOptions();
        if (options.length === 0) {
            this.interactionHint.hidden = true;
            return;
        }

        this.interactionHintText.textContent = options.length === 1
            ? this.t("interaction.hint.single", { key: this.getPrimaryInteractionKeyLabel(), action: options[0].prompt })
            : this.t("interaction.hint.multiple", { key: this.getPrimaryInteractionKeyLabel(), count: options.length });
        this.interactionHint.hidden = false;
    }

    public isInteractionChooserOpen(): boolean {
        return !!this.interactionChooserPanel && !this.interactionChooserPanel.hidden;
    }

    public handlePlayerInteract(): boolean {
        if (this.activeConversationPartner || this.currentDialog) {
            return false;
        }

        const options = this.buildNearbyInteractionOptions();
        if (options.length === 0) {
            return false;
        }

        if (options.length === 1) {
            options[0].activate();
            return true;
        }

        this.openInteractionChooser(options);
        return true;
    }

    public navigateInteractionChooser(delta: number): void {
        if (!this.isInteractionChooserOpen() || this.interactionOptions.length === 0) {
            return;
        }

        const optionCount = this.interactionOptions.length;
        this.interactionSelectionIndex = (this.interactionSelectionIndex + delta + optionCount) % optionCount;
        this.renderInteractionChooser();
    }

    public confirmInteractionChoice(): boolean {
        if (!this.isInteractionChooserOpen()) {
            return false;
        }

        const currentOptions = this.buildNearbyInteractionOptions();
        if (currentOptions.length === 0) {
            this.closeInteractionChooser();
            return false;
        }

        const selectedKey = this.interactionOptions[this.interactionSelectionIndex]?.key;
        this.interactionOptions = currentOptions;
        this.interactionOptionSignature = this.getInteractionOptionSignature(currentOptions);
        this.interactionSelectionIndex = Math.max(0, currentOptions.findIndex(option => option.key === selectedKey));

        const selectedOption = this.interactionOptions[this.interactionSelectionIndex] ?? this.interactionOptions[0];
        this.closeInteractionChooser();
        selectedOption?.activate();
        return !!selectedOption;
    }

    public closeInteractionChooser(): void {
        if (!this.isInteractionChooserOpen()) {
            return;
        }

        this.interactionChooserBackdrop!.hidden = true;
        this.interactionChooserPanel!.hidden = true;
        this.interactionOptions = [];
        this.interactionSelectionIndex = 0;
        this.interactionOptionSignature = "";
        this.preventPlayerInteraction = clamp(this.preventPlayerInteraction - 1, 0, Infinity);
    }

    private openInteractionChooser(options: InteractionOption[]): void {
        this.ensureInteractionChooser();
        this.interactionOptions = options;
        this.interactionSelectionIndex = 0;
        this.interactionOptionSignature = this.getInteractionOptionSignature(options);
        this.interactionChooserBackdrop!.hidden = false;
        this.interactionChooserPanel!.hidden = false;
        this.interactionChooserTitle!.textContent = this.t("interaction.chooser.title", { count: options.length });
        this.interactionChooserHelp!.textContent = this.t("interaction.chooser.help");
        this.renderInteractionChooser();
        this.preventPlayerInteraction++;
    }

    private syncInteractionChooserOptions(): void {
        if (!this.isInteractionChooserOpen()) {
            return;
        }

        const refreshedOptions = this.buildNearbyInteractionOptions();
        if (refreshedOptions.length === 0) {
            this.closeInteractionChooser();
            return;
        }

        const previousKey = this.interactionOptions[this.interactionSelectionIndex]?.key;
        const nextSignature = this.getInteractionOptionSignature(refreshedOptions);
        if (nextSignature === this.interactionOptionSignature) {
            return;
        }

        this.interactionOptions = refreshedOptions;
        this.interactionOptionSignature = nextSignature;
        const preservedIndex = refreshedOptions.findIndex(option => option.key === previousKey);
        this.interactionSelectionIndex = preservedIndex >= 0 ? preservedIndex : 0;
        this.interactionChooserTitle!.textContent = this.t("interaction.chooser.title", { count: refreshedOptions.length });
        this.renderInteractionChooser();
    }

    private renderInteractionChooser(): void {
        if (!this.interactionChooserList) {
            return;
        }

        while (this.interactionChooserList.firstChild) {
            this.interactionChooserList.removeChild(this.interactionChooserList.firstChild);
        }

        this.interactionOptions.forEach((option, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = index === this.interactionSelectionIndex
                ? "timd-interaction-chooser__item timd-interaction-chooser__item--selected"
                : "timd-interaction-chooser__item";

            const title = document.createElement("span");
            title.className = "timd-interaction-chooser__item-title";
            title.textContent = option.title;

            const subtitle = document.createElement("span");
            subtitle.className = "timd-interaction-chooser__item-subtitle";
            subtitle.textContent = option.subtitle;

            button.append(title, subtitle);
            button.addEventListener("mouseenter", () => {
                this.interactionSelectionIndex = index;
                this.renderInteractionChooser();
            });
            button.addEventListener("click", () => {
                this.interactionSelectionIndex = index;
                this.confirmInteractionChoice();
            });
            this.interactionChooserList!.appendChild(button);
        });
    }

    private buildNearbyInteractionOptions(): InteractionOption[] {
        if (!this.isInGameScene()) {
            return [];
        }

        const player = this.getPlayer();
        const playerPosition = player.getScenePosition();
        const options = new Map<string, InteractionOption>();

        player.getInteractableNodes()
            .filter(node => node.canInteract())
            .sort((left, right) => left.getScenePosition().getSquareDistance(playerPosition) - right.getScenePosition().getSquareDistance(playerPosition))
            .forEach(node => {
                const option = this.createInteractionOptionForNode(node);
                options.set(option.key, option);
            });

        this.findNearbyOtherPlayers().forEach(otherPlayer => {
            const playerId = String(otherPlayer.getIdentifier());
            options.set(`player:${playerId}`, {
                key: `player:${playerId}`,
                prompt: this.t("interaction.action.chatWith", { name: otherPlayer.getDisplayName() }),
                title: this.t("interaction.action.chatWith", { name: otherPlayer.getDisplayName() }),
                subtitle: this.t("interaction.subtitle.player"),
                activate: () => this.startPlayerConversation(playerId, otherPlayer.getDisplayName())
            });
        });

        return Array.from(options.values());
    }

    private createInteractionOptionForNode(node: InteractiveNode | NpcNode): InteractionOption {
        if (node instanceof LLMAgentNode) {
            const label = node.getDisplayName();
            return {
                key: `agent:${node.getAgentId()}`,
                prompt: this.t("interaction.action.chatWith", { name: label }),
                title: this.t("interaction.action.chatWith", { name: label }),
                subtitle: this.t("interaction.subtitle.ai"),
                activate: () => node.interact()
            };
        }

        if (node instanceof IFrameNode) {
            const label = node.getInteractionLabel() || this.t("interaction.fallback.sharedPage");
            return {
                key: `iframe:${node.getId() ?? label}`,
                prompt: this.t("interaction.action.open", { name: label }),
                title: this.t("interaction.action.open", { name: label }),
                subtitle: this.t("interaction.subtitle.iframe"),
                activate: () => node.interact()
            };
        }

        if (node instanceof ChairNode) {
            const label = node.getInteractionLabel() || this.t("interaction.fallback.seat");
            return {
                key: `chair:${node.getId() ?? label}`,
                prompt: this.t("interaction.action.sit"),
                title: this.t("interaction.action.sit"),
                subtitle: label,
                activate: () => node.interact()
            };
        }

        if (node instanceof PresentationNode) {
            const label = node.getInteractionLabel() || this.t("interaction.fallback.presentation");
            return {
                key: `presentation:${node.getId() ?? label}`,
                prompt: this.t("interaction.action.start", { name: label }),
                title: this.t("interaction.action.start", { name: label }),
                subtitle: this.t("interaction.subtitle.presentation"),
                activate: () => node.interact()
            };
        }

        if (node instanceof SwitchNode) {
            const label = node.getInteractionLabel() || this.t("interaction.fallback.board");
            return {
                key: `switch:${node.getId() ?? label}`,
                prompt: this.t("interaction.action.open", { name: label }),
                title: this.t("interaction.action.open", { name: label }),
                subtitle: this.t("interaction.subtitle.tool"),
                activate: () => node.interact()
            };
        }

        if (node instanceof NpcNode) {
            const label = node.getInteractionLabel() || this.t("interaction.fallback.npc");
            return {
                key: `npc:${node.getId() ?? label}`,
                prompt: this.t("interaction.action.talkTo", { name: label }),
                title: this.t("interaction.action.talkTo", { name: label }),
                subtitle: this.t("interaction.subtitle.character"),
                activate: () => node.interact()
            };
        }

        const label = node.getInteractionLabel() || this.t("interaction.fallback.object");
        return {
            key: `interactive:${node.getId() ?? label}`,
            prompt: this.t("interaction.action.interactWith", { name: label }),
            title: this.t("interaction.action.interactWith", { name: label }),
            subtitle: this.t("interaction.subtitle.object"),
            activate: () => node.interact()
        };
    }

    private getInteractionOptionSignature(options: InteractionOption[]): string {
        return options.map(option => `${option.key}:${option.title}`).join("|");
    }

    private getPrimaryInteractionKeyLabel(): string {
        return this.input.currentControllerFamily === ControllerFamily.GAMEPAD ? "Y" : "E";
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
        if (targetPlayerId === this.userId || targetPlayerId === this.userName || event.displayName === this.userName) {
            return;
        }
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
            fromSelf: false,
            authoredByAi: false
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
            fromSelf: false,
            authoredByAi: false
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
            this.conversationWindow.setLanguage(this.currentLanguage);
            this.conversationWindow.onSubmit.connect(text => {
                void this.handleConversationWindowSubmit(text);
            }, this);
            this.conversationWindow.onVoiceSubmit.connect(({ blob, url, duration }) => {
                void this.handleConversationVoiceSubmit(blob, url, duration);
            }, this);
            this.conversationWindow.onCloseRequested.connect(() => {
                this.handleConversationWindowClose();
            }, this);
        }
        if (this.conversationWindow.getParent() !== scene.rootNode) {
            this.conversationWindow.remove();
            scene.rootNode.appendChild(this.conversationWindow);
        }
        this.conversationWindow.setLanguage(this.currentLanguage);
        return this.conversationWindow;
    }

    private ensureCharacterStatusOverlay(): void {
        if (!this.characterStatusOverlay) {
            this.characterStatusOverlay = new CharacterStatusOverlay();
        }
        this.characterStatusOverlay.open(this);
    }

    private ensureSceneNavigatorOverlay(): void {
        if (!this.isInGameScene()) {
            return;
        }
        if (!this.sceneNavigatorOverlay) {
            this.sceneNavigatorOverlay = new SceneNavigatorOverlay();
        }
        this.sceneNavigatorOverlay.open(this, {
            language: this.currentLanguage,
            onTeleport: roomId => {
                this.teleportToRoom(roomId);
            },
            onSpawnAvatar: async userId => {
                await this.spawnAvatarFromDirectory(userId);
            }
        });
        this.refreshSceneNavigatorOverlay();
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

        let statusText = this.t("conversation.status.default");
        if (pending) {
            statusText = this.t("conversation.status.replying", { name: partner.name });
        } else if (partner.type === "player" && !isPlayerConversation) {
            statusText = this.t("conversation.status.playerInactive");
        }

        const sttIndicator = this.getConversationSttIndicator();

        return {
            modeLabel: partner.type === "agent" ? this.t("conversation.mode.agent") : this.t("conversation.mode.player"),
            placeholder: partner.type === "agent"
                ? this.t("conversation.placeholder.agent", { name: partner.name })
                : this.t("conversation.placeholder.player", { name: partner.name }),
            submitLabel: pending ? this.t("conversation.submit.waiting") : this.t("conversation.submit.send"),
            statusText,
            indicatorText: sttIndicator.text,
            indicatorTone: sttIndicator.tone,
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
    private async handleConversationVoiceSubmit(blob: Blob, url: string, duration: number): Promise<void> {
        if (this.activeLLMConversation) {
            const { agent, playerId } = this.activeLLMConversation;
            const agentId = agent.getAgentId();
            
            this.appendConversationEntry(agentId, {
                senderId: playerId,
                senderName: this.userName,
                text: "[语音消息]",
                audioBlob: blob,
                audioUrl: url,
                audioDuration: duration,
                timestamp: Date.now(),
                fromSelf: true,
                authoredByAi: false
            });

            this.activeLLMConversation.pending = true;
            try {
                const formData = new FormData();
                formData.append("file", blob, "audio.webm");
                const res = await fetch("http://127.0.0.1:8001/transcribe", { method: "POST", body: formData });
                const data = await res.json();
                if (data.text) {
                    void this.submitLLMConversationMessage(data.text, { suppressSceneSpeech: true, skipUiAppend: true });
                } else {
                    this.activeLLMConversation.pending = false;
                }
            } catch (e) {
                console.error("语音转发给AI失败", e);
                this.activeLLMConversation.pending = false;
            }
            return;
        }

        if (this.activePlayerConversation) {
            const { partnerId } = this.activePlayerConversation;
            
            this.appendConversationEntry(partnerId, {
                senderId: this.getCurrentUserId(),
                senderName: this.userName,
                text: "[语音消息]",
                audioBlob: blob,
                audioUrl: url,
                audioDuration: duration,
                timestamp: Date.now(),
                fromSelf: true,
                authoredByAi: false
            });

            try {
                const formData = new FormData();
                formData.append("file", blob, "audio.webm");
                const res = await fetch("http://127.0.0.1:8001/transcribe", { method: "POST", body: formData });
                const data = await res.json();
                if (data.text) {
                    this.onlineService.sendDirectMessage(partnerId, `[对方发来语音] ${data.text}`);
                }
            } catch (e) {
                console.error("语音转发给玩家失败", e);
            }
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
        this.syncSpeechToTextCaptureState();
        void this.syncStoredConversation(partnerId, partner.type, partner.name);
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
        this.syncSpeechToTextCaptureState();
        this.updateConversationMediaLayout();
        this.repositionChatInputs();
    }

    private async submitLLMConversationMessage(text: string, options?: { suppressSceneSpeech?: boolean, skipUiAppend?: boolean }): Promise<void> {
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
    this.touchSpawnedAvatarAgent(agentId);
        conversation.pending = true;
        this.conversationWindow?.clearComposer();
        this.presentConversation(agentId);

        if (!options?.suppressSceneSpeech) {
            const duration = this.llmService.estimateSpeechDuration(trimmed);
            player.say(trimmed, duration);
        }
        agent.say("...", 4);

        if (!options?.skipUiAppend) {
            this.appendConversationEntry(agentId, {
                senderId: playerId,
                senderName: this.userName,
                text: trimmed,
                timestamp: Date.now(),
                fromSelf: true,
                authoredByAi: false
            });
        }
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
                    fromSelf: false,
                    authoredByAi: true
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
                fromSelf: false,
                authoredByAi: true
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
            fromSelf: true,
            authoredByAi: false
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
                fromSelf: true,
                authoredByAi: false
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
            fromSelf: true,
            authoredByAi: false
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

    private async syncStoredConversation(partnerId: string, partnerType: "agent" | "player", partnerName: string): Promise<void> {
        const requestId = (this.conversationSyncRequests.get(partnerId) ?? 0) + 1;
        this.conversationSyncRequests.set(partnerId, requestId);

        const conversation = await fetchConversation(partnerType === "agent" ? "agent" : "user", partnerId, partnerName);
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
                fromSelf: message.senderId === this.getCurrentUserId(),
                authoredByAi: message.senderType === "agent"
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
                    fromSelf: message.senderId === this.getCurrentUserId(),
                    authoredByAi: message.senderType === "agent"
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
            && left.authoredByAi === right.authoredByAi
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

    private handleRoomInfoUpdate(event: RoomInfoEvent): void {
        const presences = event.spawnedAvatars ?? [];
        this.spawnedAvatarPresences.clear();
        presences.forEach(presence => {
            this.spawnedAvatarPresences.set(presence.ownerUserId, presence);
        });

        if (this.isInGameScene()) {
            this.syncSpawnedAvatarRoster(presences);
        }
        this.refreshSceneNavigatorOverlay();
    }

    private rebuildSceneRoomDirectory(): void {
        if (!this.isInGameScene()) {
            return;
        }

        const labelNodes = this.getGameScene().rootNode.getDescendantsByType<TiledTextNode>(TiledTextNode);
        const rawEntries = labelNodes
            .map(node => {
                const name = node.getText().trim();
                if (!name) {
                    return null;
                }
                const position = node.getScenePosition();
                return {
                    name,
                    x: Math.round(position.x + (node.getWidth() / 2)),
                    y: Math.round(position.y + node.getHeight() + 16)
                };
            })
            .filter((entry): entry is { name: string; x: number; y: number } => !!entry);

        const totals = new Map<string, number>();
        rawEntries.forEach(entry => {
            totals.set(entry.name, (totals.get(entry.name) ?? 0) + 1);
        });

        const seen = new Map<string, number>();
        this.sceneRoomEntries = rawEntries
            .map(entry => {
                const occurrence = (seen.get(entry.name) ?? 0) + 1;
                seen.set(entry.name, occurrence);
                const duplicateCount = totals.get(entry.name) ?? 1;
                const suffix = duplicateCount > 1 ? ` ${occurrence}` : "";
                return {
                    id: `${entry.name}:${entry.x}:${entry.y}`,
                    name: `${entry.name}${suffix}`,
                    subtitle: this.t("navigator.rooms.locationHint"),
                    x: entry.x,
                    y: entry.y
                };
            })
            .sort((left, right) => left.name.localeCompare(right.name));

        this.refreshSceneNavigatorOverlay();
    }

    private refreshSceneNavigatorOverlay(): void {
        this.sceneNavigatorOverlay?.setRooms(this.sceneRoomEntries);
        this.sceneNavigatorOverlay?.setLoadingUsers(!!this.avatarDirectoryLoadPromise);
        this.sceneNavigatorOverlay?.setUserError(this.avatarDirectoryError);
        this.sceneNavigatorOverlay?.setBusyUserId(this.avatarDirectoryBusyUserId);

        const selfUserId = this.getCurrentUserId();
        const activePresence = this.spawnedAvatarPresences.get(selfUserId);
        this.sceneNavigatorOverlay?.setActiveAvatarLabel(activePresence?.displayName ?? null);
        this.sceneNavigatorOverlay?.setAvatars(this.avatarDirectoryUsers
            .filter(user => user.userId !== selfUserId)
            .map(user => ({
                ...user,
                statusLabel: user.isOnline
                    ? this.t("navigator.avatars.statusOnline")
                    : Array.from(this.spawnedAvatarPresences.values()).some(presence => presence.targetUserId === user.userId)
                    ? this.t("navigator.avatars.statusActive")
                    : user.aiHostingEnabled === false
                        ? this.t("navigator.avatars.statusHostingDisabled")
                    : user.hasCharacterSystemPrompt
                        ? this.t("navigator.avatars.statusPromptConfigured")
                        : undefined
            })));
    }

    private async refreshAvatarDirectory(force = false): Promise<void> {
        if (this.avatarDirectoryLoadPromise && !force) {
            await this.avatarDirectoryLoadPromise;
            return;
        }

        const requestVersion = this.avatarDirectoryRequestVersion + 1;
        this.avatarDirectoryRequestVersion = requestVersion;
        const currentLoadPromise = (async () => {
            this.avatarDirectoryError = null;
            this.refreshSceneNavigatorOverlay();
            try {
                const users = await fetchAvatarDirectoryUsers();
                this.avatarDirectoryUsers = [...users].sort((left, right) => left.displayName.localeCompare(right.displayName));
            } catch (error) {
                console.warn("Avatar directory load failed", error);
                this.avatarDirectoryUsers = [];
                this.avatarDirectoryError = this.t("navigator.avatars.loadFailed");
            } finally {
                if (this.avatarDirectoryRequestVersion === requestVersion) {
                    this.avatarDirectoryLoadPromise = null;
                }
                this.refreshSceneNavigatorOverlay();
            }
        })();

        this.avatarDirectoryLoadPromise = currentLoadPromise;
        this.refreshSceneNavigatorOverlay();
        await currentLoadPromise;
    }

    private getAvatarSpawnAnchor(): { x: number; y: number } {
        return { ...RIGHT_ELEVATOR_SPAWN_POINT };
    }

    private getSpawnedAvatarSummonPosition(ownerUserId: string, agentId: string): { x: number; y: number } {
        const offsetSeed = `${ownerUserId}:${agentId}`;
        let hash = 0;
        for (let index = 0; index < offsetSeed.length; index += 1) {
            hash = ((hash << 5) - hash) + offsetSeed.charCodeAt(index);
            hash |= 0;
        }

        const offsetOptions = [
            { x: 28, y: 0 },
            { x: -28, y: 0 },
            { x: 0, y: 28 },
            { x: 0, y: -28 },
            { x: 22, y: 22 },
            { x: -22, y: 22 }
        ];
        const offset = offsetOptions[Math.abs(hash) % offsetOptions.length];

        if (ownerUserId === this.getCurrentUserId()) {
            const position = this.getPlayer().getScenePosition();
            return { x: position.x + offset.x, y: position.y + offset.y };
        }

        const ownerNode = this.getOtherPlayerById(ownerUserId);
        if (ownerNode) {
            const position = ownerNode.getScenePosition();
            return { x: position.x + offset.x, y: position.y + offset.y };
        }

        return { ...RIGHT_ELEVATOR_SPAWN_POINT };
    }

    private buildSpawnedAvatarWanderArea(center: { x: number; y: number }): { x: number; y: number; width: number; height: number } {
        return {
            x: center.x - (SPAWNED_AVATAR_WANDER_SIZE / 2),
            y: center.y - (SPAWNED_AVATAR_WANDER_SIZE / 2),
            width: SPAWNED_AVATAR_WANDER_SIZE,
            height: SPAWNED_AVATAR_WANDER_SIZE
        };
    }

    private async spawnAvatarFromDirectory(targetUserId: string): Promise<void> {
        const trimmedUserId = targetUserId.trim();
        if (!trimmedUserId || this.avatarDirectoryBusyUserId) {
            return;
        }

        const targetUser = this.avatarDirectoryUsers.find(user => user.userId === trimmedUserId);
        if (targetUser?.isOnline) {
            this.showNotification(this.t("navigator.avatars.spawnOnlineBlocked", { name: targetUser.displayName }));
            return;
        }

        if (targetUser?.aiHostingEnabled === false) {
            this.showNotification(this.t("navigator.avatars.spawnDisabled", { name: targetUser.displayName }));
            return;
        }

        this.avatarDirectoryBusyUserId = trimmedUserId;
        this.refreshSceneNavigatorOverlay();

        try {
            const agent = await spawnAvatarAgent({
                targetUserId: trimmedUserId,
                position: this.getAvatarSpawnAnchor()
            });
            if (!agent) {
                this.showNotification(this.t("navigator.avatars.spawnFailed"));
                return;
            }

            const summonPosition = this.getSpawnedAvatarSummonPosition(this.getCurrentUserId(), agent.agentId);
            this.onlineService.emitSpawnedAvatarUpsert({
                ownerUserId: this.getCurrentUserId(),
                targetUserId: trimmedUserId,
                agentId: agent.agentId,
                displayName: agent.displayName,
                spriteIndex: agent.spriteIndex,
                position: {
                    x: agent.position.x,
                    y: agent.position.y
                },
                summonPosition,
                wanderArea: this.buildSpawnedAvatarWanderArea(summonPosition),
                lastInteractionAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + (5 * 60 * 1000)).toISOString()
            });
            this.showNotification(this.t("navigator.avatars.spawned", { name: agent.displayName }));
        } catch (error) {
            console.warn("Avatar spawn failed", error);
            this.showNotification(this.t("navigator.avatars.spawnFailed"));
        } finally {
            this.avatarDirectoryBusyUserId = null;
            this.refreshSceneNavigatorOverlay();
        }
    }

    private teleportToRoom(roomId: string): void {
        const room = this.sceneRoomEntries.find(entry => entry.id === roomId);
        if (!room || !this.isInGameScene()) {
            return;
        }

        const player = this.getPlayer();
        player.moveTo(room.x, room.y);
        this.getCamera().moveTo(room.x, room.y);
        this.showNotification(this.t("navigator.rooms.teleported", { name: room.name }));
    }

    private syncSpawnedAvatarRoster(presences: SpawnedAvatarPresence[], forceRecreate = false): void {
        if (!this.isInGameScene()) {
            return;
        }

        const activeOwners = new Set<string>();
        presences.forEach(presence => {
            activeOwners.add(presence.ownerUserId);
            const existingNode = this.spawnedAvatarNodes.get(presence.ownerUserId);
            const shouldRecreate = forceRecreate
                || !existingNode
                || existingNode.getAgentId() !== presence.agentId
                || existingNode.getDisplayName() !== presence.displayName
                || existingNode.getSpriteIndex() !== presence.spriteIndex;

            let node = existingNode;
            if (shouldRecreate) {
                if (existingNode) {
                    if (this.activeLLMConversation?.agent === existingNode) {
                        this.closeLLMConversation(existingNode);
                    }
                    existingNode.remove();
                }
                node = new LLMAgentNode({
                    id: `spawned-avatar-${presence.ownerUserId}`,
                    agentId: presence.agentId,
                    spriteIndex: presence.spriteIndex,
                    displayName: presence.displayName,
                    caption: this.t("navigator.avatars.caption")
                });
                this.getGameScene().rootNode.appendChild(node);
                this.spawnedAvatarNodes.set(presence.ownerUserId, node);
            }

            node!.setNavigation({
                summonTarget: presence.summonPosition,
                walkArea: presence.wanderArea
            });
            if (shouldRecreate) {
                node!.moveTo(presence.position.x, presence.position.y);
            }
        });

        Array.from(this.spawnedAvatarNodes.entries()).forEach(([ownerUserId, node]) => {
            if (activeOwners.has(ownerUserId)) {
                return;
            }
            if (this.activeLLMConversation?.agent === node) {
                this.closeLLMConversation(node);
            }
            node.remove();
            this.spawnedAvatarNodes.delete(ownerUserId);
        });
    }

    private touchSpawnedAvatarAgent(agentId: string): void {
        if (!agentId.trim()) {
            return;
        }
        const isSpawnedAvatar = Array.from(this.spawnedAvatarPresences.values()).some(presence => presence.agentId === agentId);
        if (isSpawnedAvatar) {
            this.onlineService.emitSpawnedAvatarTouch(agentId);
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

    private async syncConversationMediaState(): Promise<void> {
        if (!this.JitsiInstance) {
            return;
        }
        try {
            await this.JitsiInstance.syncConversationMedia(this.shouldShowConversationMedia());
        } finally {
            this.characterStatusOverlay?.refresh();
            this.updateConversationMediaLayout();
        }
    }

    private refreshConversationMediaState(): void {
        void this.syncConversationMediaState();
    }

    private syncSpeechToTextCaptureState(): void {
        const shouldCapture = this.isLocalAudioEnabled() && this.isTranscriptionEnabled;
        if (shouldCapture) {
            void this.sttService?.start();
            return;
        }

        this.sttService?.stop();
    }

    private refreshConversationStatusIndicator(): void {
        if (!this.activeConversationPartner) {
            return;
        }
        const partner = this.conversationPartners.get(this.activeConversationPartner);
        if (!partner) {
            return;
        }
        this.conversationWindow?.updateComposer(this.getConversationWindowOptions(this.activeConversationPartner, partner));
    }

    private getConversationSttIndicator(): { text: string; tone: ConversationSttIndicatorTone } {
        if (!this.isLocalAudioEnabled()) {
            return {
                text: this.t("conversation.stt.audioOff"),
                tone: "neutral"
            };
        }

        if (!this.isTranscriptionEnabled) {
            return {
                text: this.t("conversation.stt.disabled"),
                tone: "warning"
            };
        }

        switch (this.sttStatus) {
            case "starting":
                return {
                    text: this.t("conversation.stt.starting"),
                    tone: "active"
                };
            case "transcribing":
                return {
                    text: this.t("conversation.stt.transcribing"),
                    tone: "active"
                };
            case "error":
                return {
                    text: this.t("conversation.stt.error"),
                    tone: "error"
                };
            case "listening":
                return {
                    text: this.t("conversation.stt.listening"),
                    tone: "active"
                };
            default:
                return {
                    text: this.t("conversation.stt.ready"),
                    tone: "neutral"
                };
        }
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
})().catch((error: unknown) => {
    console.error("Application startup failed", error);
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.right = "0";
    overlay.style.bottom = "0";
    overlay.style.left = "0";
    overlay.style.zIndex = "20000";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.padding = "24px";
    overlay.style.background = "rgba(7, 10, 18, 0.94)";
    overlay.style.color = "#eef3ff";
    overlay.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif";

    const panel = document.createElement("div");
    panel.style.maxWidth = "720px";
    panel.style.width = "100%";
    panel.style.padding = "20px 22px";
    panel.style.border = "1px solid rgba(255, 255, 255, 0.14)";
    panel.style.background = "linear-gradient(160deg, rgba(22, 29, 44, 0.98), rgba(11, 16, 26, 0.98))";
    panel.style.boxShadow = "0 24px 60px rgba(0, 0, 0, 0.42)";

    const title = document.createElement("h1");
    title.textContent = "Startup Error";
    title.style.margin = "0 0 10px";
    title.style.fontSize = "24px";

    const body = document.createElement("pre");
    body.textContent = message;
    body.style.margin = "0";
    body.style.whiteSpace = "pre-wrap";
    body.style.wordBreak = "break-word";
    body.style.font = "14px/1.5 'SFMono-Regular', Consolas, monospace";

    panel.append(title, body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
});
