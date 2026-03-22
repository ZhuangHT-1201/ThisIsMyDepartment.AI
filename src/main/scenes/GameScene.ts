import { ThisIsMyDepartmentApp } from "../ThisIsMyDepartmentApp";
import { Scene } from "../../engine/scene/Scene";
import { PlayerNode } from "../nodes/PlayerNode";
import { asset } from "../../engine/assets/Assets";
import { TiledMap } from "../../engine/tiled/TiledMap";
import { TiledMapNode } from "../../engine/scene/TiledMapNode";
import { CollisionNode } from "../nodes/CollisionNode";
import { LightNode } from "../nodes/LightNode";
import { GAME_HEIGHT, GAME_WIDTH, Layer, STANDARD_FONT } from "../constants";
import { CameraLimitNode } from "../nodes/CameraLimitNode";
import { ScenePointerDownEvent } from "../../engine/scene/events/ScenePointerDownEvent";
import { isDev } from "../../engine/util/env";
import { BitmapFont } from "../../engine/assets/BitmapFont";
import { FpsCounterNode } from "../../engine/scene/FpsCounterNode";
import { Direction } from "../../engine/geom/Direction";
import { FadeToBlackTransition } from "../../engine/transitions/FadeToBlackTransition";
import { ChairNode } from "../nodes/ChairNode";
import { FocusNode } from "../nodes/FocusNode";
import { SwitchNode } from "../nodes/SwitchNode";
import { NpcNode } from "../nodes/NpcNode";
import { LLMAgentNode } from "../nodes/LLMAgentNode";
import { PresentationBoardNode } from "../nodes/PresentationBoardNode";
import { PresentationNode } from "../nodes/PresentationNode";
import { IFrameNode } from "../nodes/IFrameNode";
import { SpeakerNode } from "../nodes/SpeakerNode";
import { CatNode } from "../nodes/CatNode";
import { TiledTextNode } from "../nodes/TiledTextNode";
import { NotificationNode } from "../nodes/NotificationNode";

export class GameScene extends Scene<ThisIsMyDepartmentApp> {
    @asset(STANDARD_FONT)
    private static font: BitmapFont;

    @asset("map/map.tiledmap.json")
    private static map: TiledMap;

    private static mapLoadPromise?: Promise<TiledMap>;

    private debugMode: boolean = false;
    private fpsCounterNode?: FpsCounterNode<ThisIsMyDepartmentApp>;

    public mapNode!: TiledMapNode<ThisIsMyDepartmentApp>;
    public notificationNode?: NotificationNode;

    private static async getLoadedMap(): Promise<TiledMap> {
        if (GameScene.map) {
            return GameScene.map;
        }

        if (!GameScene.mapLoadPromise) {
            console.warn("GameScene map asset was not ready during setup; loading fallback map asset directly.");
            GameScene.mapLoadPromise = TiledMap.load("assets/map/map.tiledmap.json").then(map => {
                GameScene.map = map;
                return map;
            });
        }

        return GameScene.mapLoadPromise;
    }

    private async createMapNode(): Promise<TiledMapNode<ThisIsMyDepartmentApp>> {
        const map = await GameScene.getLoadedMap();
        return new TiledMapNode<ThisIsMyDepartmentApp>({ map, objects: {
            "collision": CollisionNode,
            "player": PlayerNode,
            "light": LightNode,
            "cameraLimit": CameraLimitNode,
            /* "sound": TiledSoundNode, */
            "chair": ChairNode,
            "powerswitch": SwitchNode,
            "focus": FocusNode,
            "npc": NpcNode,
            "presentationBoard": PresentationBoardNode,
            "presentation": PresentationNode,
            "iframe": IFrameNode,
            "speaker": SpeakerNode,
            "cat": CatNode,
            "text": TiledTextNode
        }});
    }

    public async setup() {
        this.inTransition = new FadeToBlackTransition({ duration: 2, delay: 1 });
        this.mapNode = await this.createMapNode();
        this.mapNode.moveTo(0, 0).appendTo(this.rootNode).transform(m => m.scale(1));
        const player = this.mapNode.getDescendantById("Player");
        this.camera.setFollow(player);
        this.setLightLayers([ Layer.LIGHT ]);
        this.setHudLayers([Layer.HUD]);
        this.notificationNode = new NotificationNode(3, { x: this.rootNode.width - 12, y: 4, layer: Layer.HUD }).appendTo(this.rootNode);

        if (isDev()) {
            this.fpsCounterNode = new FpsCounterNode({
                font: GameScene.font,
                anchor: Direction.TOP_LEFT,
                layer: Layer.HUD
            });
            this.rootNode.appendChild(this.fpsCounterNode);
        }

        this.layoutHud();

        this.spawnConfiguredAgents();

        setTimeout(() => {
            this.game.setupScene();
        });
    }

    public resizeTo(width: number, height: number): void {
        super.resizeTo(width, height);
        this.layoutHud();
        this.notificationNode?.moveTo(this.rootNode.width - 12, 4);
        this.game.layoutConversationWindow();
    }

    public cleanup() {
        this.rootNode.clear();
    }

    public activate() {
        if (isDev()) {
            this.game.keyboard.onKeyDown.connect(this.handleKeyDown, this);
            this.game.keyboard.onKeyUp.connect(this.handleKeyUp, this);
        }
    }

    public deactivate() {
        if (isDev()) {
            this.game.keyboard.onKeyDown.disconnect(this.handleKeyDown, this);
            this.game.keyboard.onKeyUp.disconnect(this.handleKeyUp, this);
        }
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (event.key === "o") {
            if (!event.repeat) {
                this.enterDebugMode();
            }
            event.preventDefault();
            event.stopPropagation();
        }
    }

    private handleKeyUp(event: KeyboardEvent): void {
        if (event.key === "o") {
            if (!event.repeat) {
                this.leaveDebugMode();
            }
            event.preventDefault();
            event.stopPropagation();
        }
    }

    private enterDebugMode(): void {
        if (!this.debugMode) {
            this.debugMode = true;
            const bounds = this.mapNode.getSceneBounds();
            const scale = Math.min(GAME_WIDTH / bounds.width, GAME_HEIGHT / bounds.height);
            this.camera.setFollow(null).setLimits(this.mapNode.getBounds().toRect()).moveTo(bounds.centerX, bounds.centerY).setZoom(scale);
            this.onPointerDown.connect(this.handleTeleportClick, this);
        }
    }

    public leaveDebugMode(): void {
        if (this.debugMode) {
            const player = this.rootNode.getDescendantById("Player");
            if (player != null) {
                this.camera.setFollow(player).setZoom(1);
            }
            this.onPointerDown.disconnect(this.handleTeleportClick, this);
            this.debugMode = false;
        }
    }

    private handleTeleportClick(event: ScenePointerDownEvent<ThisIsMyDepartmentApp>): void {
        const player = this.rootNode.getDescendantById("Player");
        if (player != null) {
            player.moveTo(event.getX(), event.getY());
        }
    }

    private spawnConfiguredAgents(): void {
        const definitions = this.game.getAgentDefinitions();
        definitions.forEach(definition => {
            const agent = new LLMAgentNode({
                id: definition.id,
                agentId: definition.agentId,
                spriteIndex: definition.spriteIndex,
                displayName: definition.displayName,
                caption: definition.caption,
                systemPrompt: definition.systemPrompt,
                walkArea: definition.walkArea
            });
            agent.moveTo(definition.position.x, definition.position.y).appendTo(this.rootNode);
        });
    }

    private layoutHud(): void {
        const left = 10;
        const top = 10;
        this.fpsCounterNode?.moveTo(left, top);
    }
}
