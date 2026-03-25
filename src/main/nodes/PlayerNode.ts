import { Aseprite } from "../../engine/assets/Aseprite";
import { asset } from "../../engine/assets/Assets";
import { Direction, SimpleDirection } from "../../engine/geom/Direction";
import { Rect } from "../../engine/geom/Rect";
import { Vector2 } from "../../engine/graphics/Vector2";
import { ControllerEvent } from "../../engine/input/ControllerEvent";
import { ControllerIntent } from "../../engine/input/ControllerIntent";
import { SceneNodeArgs, SceneNodeAspect } from "../../engine/scene/SceneNode";
import { isDev } from "../../engine/util/env";
import { clamp } from "../../engine/util/math";
import { ThisIsMyDepartmentApp } from "../ThisIsMyDepartmentApp";
import { CharacterNode, PostCharacterTags } from "./CharacterNode";
import { InteractiveNode } from "./InteractiveNode";
import { AmbientPlayerNode } from "./player/AmbientPlayerNode";

export const playerSyncKeys = ["username", "speed", "acceleration", "deceleration", "spriteIndex"];

export class PlayerNode extends CharacterNode {

    @asset("sprites/characters/character.aseprite.json")
    private static readonly sprite: Aseprite;

    // Character settings
    private readonly speed = 150;
    private readonly acceleration = 10000;
    private readonly deceleration = 600;
    private leftMouseDown = false;
    private rightMouseDown = false;
    private previouslyPressed = 0;
    public username = "";
    public spriteIndex = 0;

    public isPlayer = true;

    private gPressed = false;

    private pushInteractionDebug(event: string, payload?: Record<string, unknown>): void {
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

    public constructor(args?: SceneNodeArgs) {
        super(playerSyncKeys, {
            aseprite: PlayerNode.sprite,
            anchor: Direction.BOTTOM,
            childAnchor: Direction.CENTER,
            tag: "idle",
            id: "player",
            sourceBounds: new Rect(7, 1, 20, 30),
            cameraTargetOffset: new Vector2(0, -30),
            ...args
        });
        const ambientPlayerLight = new AmbientPlayerNode();
        this.appendChild(ambientPlayerLight);

        if (isDev()) {
            (<any>window)["player"] = this;
        }
    }

    public getSpeed(): number {
        return this.speed * (this.isRunning ? 2.4 : 1.2);
    }

    public getAcceleration(): number {
        return this.acceleration;
    }

    public getDeceleration(): number {
        return this.deceleration;
    }

    public changeSprite(index = 0): void {
        if (ThisIsMyDepartmentApp.characterSprites.length > index && index >= 0) {
            this.spriteIndex = index;
            this.setAseprite(ThisIsMyDepartmentApp.characterSprites[index]);
            this.emitEvent("changeSprite", index);
        }
    }

    public update(dt: number, time: number) {
        super.update(dt, time);
        this.setOpacity(1);

        if (this.gPressed) {
            this.gPressed = false;
            this.inGhostMode = !this.inGhostMode;
        }

        // Controls
        const input = this.getScene()!.game.input;

        if (this.getGame().preventPlayerInteraction === 0) {
            // Move left/right
            const direction = (input.currentActiveIntents & ControllerIntent.PLAYER_MOVE_RIGHT)
                ? SimpleDirection.RIGHT
                : (input.currentActiveIntents & ControllerIntent.PLAYER_MOVE_LEFT)
                    ? SimpleDirection.LEFT
                    : (input.currentActiveIntents & ControllerIntent.PLAYER_MOVE_UP)
                        ? SimpleDirection.TOP
                        : (input.currentActiveIntents & ControllerIntent.PLAYER_MOVE_DOWN)
                            ? SimpleDirection.BOTTOM
                            : SimpleDirection.NONE;

            this.setDirection(direction);
        }

        if (input.currentActiveIntents & ControllerIntent.PLAYER_RELOAD && this.getGame().preventPlayerInteraction === 0) {
            this.setTag(PostCharacterTags.DANCE);
        }
        if (this.rightMouseDown) {
            this.rightMouseDown = false;
        }
        // TODO
        if (this.canInteract(ControllerIntent.PLAYER_ACTION) || this.leftMouseDown) {
            this.leftMouseDown = false;
        }
        if (this.getGame().isInteractionChooserOpen()) {
            if (this.canInteract(ControllerIntent.MENU_UP)) {
                this.getGame().navigateInteractionChooser(-1);
            }
            if (this.canInteract(ControllerIntent.MENU_DOWN)) {
                this.getGame().navigateInteractionChooser(1);
            }
            if (this.canInteract(ControllerIntent.PLAYER_INTERACT) || this.canInteract(ControllerIntent.CONFIRM)) {
                this.getGame().confirmInteractionChoice();
            }
            if (this.canInteract(ControllerIntent.ABORT)) {
                this.getGame().closeInteractionChooser();
            }
            this.updatePreviouslyPressed();
            return;
        }
        // Interact
        if (this.canInteract(ControllerIntent.PLAYER_INTERACT)) {
            const handled = this.getGame().handlePlayerInteract();
            this.pushInteractionDebug("player_handleInteraction", {
                handled
            });
        }
        // Interact
        if (this.canInteract(ControllerIntent.ABORT)) {
            const node = this.getNodeToInteractWith();
            if (node && node instanceof InteractiveNode) {
                node.reverseInteract();
            }
        }
        this.updatePreviouslyPressed();
    }

    public handleControllerInput(event: ControllerEvent) {
        if (event.direction) {
            this.invalidate(SceneNodeAspect.SCENE_TRANSFORMATION);
            return;
        }
    }

    public startPresentation(): void {
        this.getGame().preventPlayerInteraction++;
    }
    public endPresentation(): void {
        this.getGame().preventPlayerInteraction = clamp(this.getGame().preventPlayerInteraction - 1, 0, Infinity);
    }

    private updatePreviouslyPressed(): void {
        const input = this.getGame().input;
        this.previouslyPressed = input.currentActiveIntents;
    }

    /**
     * Checks if the given intent is the same as the last intent to prevent auto-key-handling on button being hold.
     */
    private canInteract(intent: ControllerIntent): boolean {
        const input = this.getGame().input;
        return (this.previouslyPressed & intent) === 0 && (input.currentActiveIntents & intent) !== 0;
    }

    public reset(): void {
        super.reset();
    }

    public setDebug(debug: boolean): void {
        this.debug = debug;
    }

    public getIdentifier(): string {
        return this.getGame().onlineService.userId;
    }

    public activate(): void {
        super.activate();
        this.username = this.getGame().userName;
        this.identifier = this.getGame().onlineService.userId;
        this.setNameLabel(this.username);
        const publishInitialState = () => {
            this.syncCharacterState(true);
        };
        this.getGame().onlineService.onPlayerConnect.connect(publishInitialState, this);
        this.getGame().onlineService.onOtherPlayerConnect.connect(playerId => {
            if (playerId && playerId !== this.getGame().onlineService.userId) {
                publishInitialState();
            }
        }, this);
        if (this.getGame().onlineService.isConnected()) {
            publishInitialState();
        }
        this.getGame().input.onDrag.filter(ev => ev.isRightStick && !!ev.direction && ev.direction.getLength() > 0.3).connect(this.handleControllerInput, this);
        const handleControllerInputChange = () => {
            this.isRunning = (this.getGame().input.currentActiveIntents & ControllerIntent.PLAYER_RUN) === ControllerIntent.PLAYER_RUN;
        };
        this.getGame().input.onButtonDown.connect(handleControllerInputChange, this);
        this.getGame().input.onButtonUp.connect(handleControllerInputChange, this);
        this.getGame().keyboard.onKeyPress.filter(ev => ev.key === "g").connect(() => {
            this.gPressed = true;
        }, this);
    }
}
