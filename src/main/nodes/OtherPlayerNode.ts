import { CharacterNode } from "./CharacterNode";
import { Direction } from "../../engine/geom/Direction";
import { SceneNodeArgs } from "../../engine/scene/SceneNode";
import { Vector2 } from "../../engine/graphics/Vector2";
import { Rect } from "../../engine/geom/Rect";
import { AmbientPlayerNode } from "./player/AmbientPlayerNode";
import { ThisIsMyDepartmentApp } from "../ThisIsMyDepartmentApp";
import { Layer } from "../constants";

export const playerSyncKeys = ["username", "speed", "acceleration", "deceleration"];

export class OtherPlayerNode extends CharacterNode {

    // Character settings
    private readonly speed = 150;
    private readonly acceleration = 10000;
    private readonly deceleration = 600;
    private initDone = false;
    public username = "";
    private displayName = "";

    public constructor(id: string, public spriteIndex = 0, displayName?: string, args?: SceneNodeArgs) {
        super(playerSyncKeys, {
            aseprite: ThisIsMyDepartmentApp.characterSprites[spriteIndex],
            anchor: Direction.BOTTOM,
            childAnchor: Direction.CENTER,
            tag: "idle",
            id,
            layer: Layer.FOREGROUND,
            sourceBounds: new Rect(7, 1, 20, 30),
            cameraTargetOffset: new Vector2(0, -30),
            ...args
        });
        this.identifier = id;
        this.username = displayName ?? id;
        this.displayName = displayName ?? id;
        const ambientPlayerLight = new AmbientPlayerNode();
        this.appendChild(ambientPlayerLight);
        this.setNameLabel(this.displayName);
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

    public emitEvent(): void { }

    public syncCharacterState(): void {}

    public changePlayerName(playerName: string): void {
        this.username = playerName;
        this.displayName = playerName;
        this.setNameLabel(playerName);
    }

    public getDisplayName(): string {
        return this.displayName;
    }

    public matchesKnownPlayerName(playerNames: Set<string>): boolean {
        return playerNames.has(this.username) || playerNames.has(this.displayName) || playerNames.has(String(this.getIdentifier()));
    }

    public changeSprite(spriteIndex: number): void {
        if (ThisIsMyDepartmentApp.characterSprites.length > spriteIndex && spriteIndex > 0) {
            this.spriteIndex = spriteIndex;
            this.setAseprite(ThisIsMyDepartmentApp.characterSprites[spriteIndex]);
        }
    }

    public update(dt: number, time: number) {
        super.update(dt, time);
        if (this.isInScene() && !this.initDone) {
            this.initDone = true;
        }
    }

    public reset(): void {
        super.reset();
    }

    public setDebug(debug: boolean): void {
        this.debug = debug;
    }
}
