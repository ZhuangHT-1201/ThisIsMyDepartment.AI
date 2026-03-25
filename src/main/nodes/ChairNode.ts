import { Aseprite } from "../../engine/assets/Aseprite";
import { Direction } from "../../engine/geom/Direction";
import { InteractiveNode } from "./InteractiveNode";
import { SceneNodeArgs } from "../../engine/scene/SceneNode";
import { asset } from "../../engine/assets/Assets";
import { PreCharacterTags } from "./CharacterNode";

export interface ChairNodeArgs extends SceneNodeArgs {
    onUpdate?: (state: boolean) => boolean | undefined;
}

export class ChairNode extends InteractiveNode {
    @asset("sprites/empty.aseprite.json")
    private static readonly noSprite: Aseprite;

    private sitDown: boolean = false;
    public constructor({ onUpdate, ...args }: ChairNodeArgs) {
        super({
            aseprite: ChairNode.noSprite,
            anchor: Direction.CENTER,
            tag: "off",
            ...args
        }, "按E键坐下");
        this.setInteractionActionLabel("Sit down on");
        this.setInteractionLabel(args.tiledObject?.getName()?.trim() || "Seat");
    }

    protected getRange(): number {
        return 10;
    }

    public update(dt: number, time: number): void {
        if (this.playerSitsDown()) {
            this.caption = "";
        } else {
            const keyLabel = this.getPrimaryActionKeyLabel();
            this.caption = `按${keyLabel}键坐下`;
        }
        super.update(dt, time);
    }

    private playerSitsDown(): boolean {
        const isSitting = this.sitDown ? this.getPlayer()?.getPosition().getDistance(this.getPosition()) === 0 : false;
        if (isSitting !== this.sitDown && !isSitting) {
            this.sitDown = false;
        }
        return isSitting;
    }

    public interact(): void {
        if (this.canInteract()) {
            this.getPlayer()?.setX(this.x);
            this.getPlayer()?.setY(this.y);
            this.getPlayer()?.setPreTag(PreCharacterTags.BACK);
            this.sitDown = true;
        }
    }
}
