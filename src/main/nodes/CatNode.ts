import { Aseprite } from "../../engine/assets/Aseprite";
import { Direction } from "../../engine/geom/Direction";
import { SceneNodeArgs } from "../../engine/scene/SceneNode";
import { asset } from "../../engine/assets/Assets";
import { InteractiveNode } from "./InteractiveNode";

export class CatNode extends InteractiveNode {
    @asset("sprites/cat.aseprite.json")
    private static readonly sprite: Aseprite;

    public constructor(args: SceneNodeArgs) {
        super({
            aseprite: CatNode.sprite,
            anchor: Direction.CENTER,
            tag: "idle",
            ...args
        }, "按E键进行互动");
    }

    protected getRange(): number {
        return 40;
    }

    public update(dt: number, time: number): void {
        const keyLabel = this.getPrimaryActionKeyLabel();
        const action = this.getPlayer()?.isPetting() ? "停止" : "撸猫";
        this.caption = `按${keyLabel}键${action}`;
        if (!this.isInRange() && this.getPlayer()?.isPetting()) {
            this.getPlayer()?.stopPetting();
        }
        super.update(dt, time);
    }

    public interact(): void {
        if (this.getPlayer()?.isPetting()) {
            this.getPlayer()?.stopPetting();
        } else {
            this.getPlayer()?.startPetting();
        }
    }
}
