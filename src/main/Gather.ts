import { DialogJSON } from "*.dialog.json";
import createCustomElements from "../customElements/createCustomElements";
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
import { setupPythonLLMBridge } from "./services/demoLLMBridge";
import { ConversationEntry, ConversationWindow } from "./ui/ConversationWindow";
import { GameScene } from "./scenes/GameScene";
import { LoadingScene } from "./scenes/LoadingScene";
import type { LLMAgentDefinition } from "./agents/AgentDefinition";

export enum GameStage {
    NONE = 0,
    START = 1,
    GAME = 2
}

export class Gather extends Game {
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

    public static instance: Gather;

    public preventPlayerInteraction = 0;
    public JitsiInstance?: JitsiInstance;

    private stageStartTime = 0;
    protected stageTime = 0;
    private dialogs: Dialog[] = [];
    private npcs: CharacterNode[] = [];
    private players: Record<string, OtherPlayerNode> = {};
    public room: JitsiConference | null = null;
    public userName: string = "anonymous";

    private conversationWindow?: ConversationWindow;
    private activeConversationPartner: string | null = null;
    private conversationLogs = new Map<string, ConversationEntry[]>();
    private conversationPartners = new Map<string, { name: string; type: "agent" | "player" }>();

    private readonly llmService = LLMAgentService.instance;
    private activeLLMConversation: { agent: LLMAgentNode; inputNode: TextInputNode<Gather>; playerId: string; pending: boolean } | null = null;
    private transientChatInput?: TextInputNode<Gather>;
    private readonly agentDefinitions: LLMAgentDefinition[];

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
    public initialPlayerSprite = 0;


    public get onlineService(): OnlineService {
        return this._onlineService;
    }
    public set onlineService(service: OnlineService) {
        this._onlineService = service;
        this.onlineService.onOtherPlayerJoined.connect(event => {
            this.spawnOtherPlayer(event);
        });
        this.onlineService.onOtherPlayerDisconnect.connect(() => {
            this.checkIfPlayersShouldBeRemoved();
        });
    }
    private _onlineService!: OnlineService;

    public getAgentDefinitions(): readonly LLMAgentDefinition[] {
        return this.agentDefinitions;
    }

    public constructor(agentDefinitions: LLMAgentDefinition[]) {
        super();
        this.agentDefinitions = agentDefinitions;
        this.prepareAutoStart();
    }

    // Called by GameScene
    public setupScene(): void {
        // TODO Enable this when npc can be synced
        // this.spawnNPCs();
        this.setStage(GameStage.GAME);
        this.JitsiInstance = new JitsiInstance();
        this.JitsiInstance.create().then(room => {
            this.room = room;
            this.room.setDisplayName(this.userName);
        });
        // Assets cannot be loaded in constructor because the LoadingScene
        // is not initialized at constructor time and Assets are loaded in the LoadingScene
        this.dialogs = [
            new Dialog(Gather.trainDialog)
        ];

        this.input.onButtonUp.filter(e => e.isPlayerChat).connect(() => this.handleChat(), this);

        this.keyboard.onKeyPress.filter(ev => ev.key === "9" && ev.ctrlKey).connect((ev) => { ev.preventDefault(); this.preventPlayerInteraction = 0;});

        this.input.onDrag.filter(e => e.isRightStick && !!e.direction && e.direction.getLength() > 0.3).connect(this.getPlayer().handleControllerInput, this.getPlayer());

        this.ensureConversationWindow();
        this.repositionConversationWindow();
    }

    private prepareAutoStart(): void {
        this.userName = "Guest";
        this.initialPlayerSprite = 0;
        if (!this.onlineService) {
            this.onlineService = new OnlineService(this.userName);
        }
    }

    public update(dt: number, time: number): void {
        this.stageTime = time - this.stageStartTime;
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
        this.players[id]?.remove();
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
        const textInputNode = new TextInputNode<Gather>("", "ENTER TEXT", undefined, true, { anchor: Direction.TOP_RIGHT, layer: Layer.HUD, padding: 4 });
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
        if (!this.isInGameScene()) {
            return;
        }
        const rootNode = this.getGameScene()?.rootNode;
        if (!rootNode) {
            return;
        }
        const playerId = this.room?.myUserId() ?? "local-player";
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
    const inputNode = new TextInputNode<Gather>("", `请输入...`, undefined, true, { anchor: Direction.TOP_RIGHT, layer: Layer.HUD, padding: 4 });
        rootNode.appendChild(inputNode);
    this.positionChatInputNode(inputNode);
        inputNode.focus();

        agent.inConversation = true;
        this.activeLLMConversation = { agent, inputNode, playerId, pending: false };
        this.focusConversation(agentId, { name: agentName, type: "agent" });

        inputNode.onTextSubmit.connect(async text => {
            const conversation = this.activeLLMConversation;
            if (!conversation || conversation.agent !== agent) {
                return;
            }

            const trimmed = text.trim();
            if (!trimmed) {
                this.closeLLMConversation(agent);
                return;
            }

            if (conversation.pending) {
                inputNode.focus();
                return;
            }

            conversation.pending = true;
            inputNode.setText("");

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
                    inputNode.setText("");
                    inputNode.focus();
                }
            }
        }, this);
    }

    private closeLLMConversation(agent?: LLMAgentNode, options?: { resetHistory?: boolean }): void {
        if (!this.activeLLMConversation) {
            return;
        }
        if (agent && this.activeLLMConversation.agent !== agent) {
            return;
        }

        const { agent: activeAgent, inputNode, playerId } = this.activeLLMConversation;
        inputNode.onTextSubmit.clear();
        if (inputNode.active) {
            inputNode.blur();
        }
        inputNode.remove();
        activeAgent.endConversation(playerId, options?.resetHistory ?? false);
        activeAgent.say();
        this.handleConversationClosed(activeAgent.getAgentId());
        this.activeLLMConversation = null;
        this.repositionChatInputs();
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
    }

    public initGame(): void {
        // Place player into world
        const player = this.getPlayer();
        player.changeSprite(this.initialPlayerSprite);
        const pos = player.getScenePosition();
        player.remove().moveTo(pos.x, pos.y).appendTo(this.getGameScene().rootNode);
        MusicManager.getInstance().loopTrack(0);
        FxManager.getInstance().playSounds();
    }

    public getPlayer(id?: string): PlayerNode {
        return this.getGameScene().rootNode.getDescendantsByType<PlayerNode>(PlayerNode)[0];
    }

    public getOtherPlayerById(id: string): OtherPlayerNode | null {
        return this.players[id];
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
                if (player && !this.onlineService.players.has(player.getIdentifier() as string)) {
                    playersToRemove.push(player);
                }
            }
            if (playersToRemove.length === 1) {
                playersToRemove[0].remove();
                return playersToRemove[0].getIdentifier() as string;
            }
        }
        return null;
    }

    public async spawnOtherPlayer(event: any): Promise<void> {
        if (event == null || !event.position || event.id === this.onlineService.username) {
            return;
        }
        console.log("Should spawn other player: ", event);
        while (this.isInGameScene == null) {
            await sleep(100);
        }
        if (!this.scenes.getScene(GameScene)) {
            this.scenes.setScene(GameScene as any);
        }
        while (!this.scenes.getScene(GameScene)) {
            await sleep(100);
        }
        let playerExists = false;
        for (const playerId in this.players) {
            if (!Object.prototype.hasOwnProperty.call(this.players, playerId)) {
                continue;
            }
            const player = this.players[playerId];
            if (player && player.getIdentifier() === event.id) {
                playerExists = true;
                break;
            }
        }
        if (!playerExists) {
            try {
                this.getGameScene();
            } catch (_) {
                await this.scenes.setScene(GameScene as any);
            }
            const otherPlayer = new OtherPlayerNode(event.id);
            this.getGameScene().rootNode?.appendChild(otherPlayer);
            otherPlayer.moveTo(event.position?.x ?? this.getPlayer().getX(), event.position?.y ?? this.getPlayer().getY());
            otherPlayer.reset();

            this.players[event.id] = otherPlayer;
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

        this.focusConversation(participantId, { name: displayName, type: "player" });
        this.appendConversationEntry(participantId, {
            senderId: participantId,
            senderName: displayName,
            text,
            timestamp: Date.now(),
            fromSelf: false
        });
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
        if (!this.isInGameScene()) {
            return this.conversationWindow;
        }
        const scene = this.getGameScene();
        if (!this.conversationWindow) {
            this.conversationWindow = new ConversationWindow();
        }
        if (this.conversationWindow.getParent() !== scene.rootNode) {
            this.conversationWindow.remove();
            scene.rootNode.appendChild(this.conversationWindow);
        }
        if (this.activeConversationPartner) {
            const partner = this.conversationPartners.get(this.activeConversationPartner);
            if (partner) {
                const entries = this.conversationLogs.get(this.activeConversationPartner) ?? [];
                this.conversationWindow.showConversation(partner.name, entries);
            }
        }
        return this.conversationWindow;
    }

    private repositionConversationWindow(): void {
        if (!this.isInGameScene()) {
            return;
        }
        const window = this.ensureConversationWindow();
        if (!window) {
            return;
        }
        const rootNode = this.getGameScene().rootNode;
        window.layoutWithin(rootNode.width, rootNode.height);
        this.repositionChatInputs();
    }

    private focusConversation(partnerId: string, partner: { name: string; type: "agent" | "player" }): void {
        this.ensureConversationWindow();
        this.conversationPartners.set(partnerId, partner);
        if (!this.conversationLogs.has(partnerId)) {
            this.conversationLogs.set(partnerId, []);
        }
        this.activeConversationPartner = partnerId;
        const entries = this.conversationLogs.get(partnerId)!;
        this.conversationWindow?.showConversation(partner.name, entries);
        this.repositionConversationWindow();
    }

    private appendConversationEntry(partnerId: string, entry: ConversationEntry): void {
        const log = this.conversationLogs.get(partnerId);
        if (!log) {
            this.conversationLogs.set(partnerId, [entry]);
        } else {
            log.push(entry);
        }
        if (this.activeConversationPartner === partnerId) {
            const partner = this.conversationPartners.get(partnerId);
            if (partner) {
                this.ensureConversationWindow();
                const entries = this.conversationLogs.get(partnerId)!;
                this.conversationWindow?.showConversation(partner.name, entries);
                this.repositionConversationWindow();
            }
        }
    }

    private handleConversationClosed(partnerId: string): void {
        if (this.activeConversationPartner === partnerId) {
            this.activeConversationPartner = null;
            this.conversationWindow?.hideWindow();
        }
        this.repositionChatInputs();
    }

    private handleOutgoingPlayerChat(targetIds: string[], text: string): void {
        const trimmed = text.trim();
        if (trimmed.length === 0 || targetIds.length === 0) {
            return;
        }
        const senderId = this.room?.myUserId() ?? "local-player";
        const timestamp = Date.now();
        targetIds.forEach((id, index) => {
            const name = this.room?.getParticipantById(id)?.getDisplayName() ?? id;
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
        });
    }

    private handleOutgoingBroadcastChat(text: string): void {
        const trimmed = text.trim();
        if (trimmed.length === 0) {
            return;
        }
        const partnerId = this.activeConversationPartner;
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
            senderId: this.room?.myUserId() ?? "local-player",
            senderName: this.userName,
            text: trimmed,
            timestamp: Date.now(),
            fromSelf: true
        });
    }

    private positionChatInputNode(inputNode: TextInputNode<Gather>): void {
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
        if (this.activeLLMConversation?.inputNode && this.activeLLMConversation.inputNode.isInScene()) {
            this.positionChatInputNode(this.activeLLMConversation.inputNode);
        }
    }
}

(async () => {
    createCustomElements();
    const agentDefinitions = setupPythonLLMBridge();
    // If you prefer manual configuration, replace the call above with your own bridge:
    // LLMAgentService.instance.configureBridge(async payload => fetch("http://127.0.0.1:5050/chat", {...}));
    const game = new Gather(agentDefinitions);
    Gather.instance = game;
    await game.scenes.setScene(LoadingScene);
    (window as any).game = game;
    game.start();
})();
