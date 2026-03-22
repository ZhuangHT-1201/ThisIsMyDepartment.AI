import { asset } from "../../engine/assets/Assets";
import { Direction } from "../../engine/geom/Direction";
import { ScenePointerDownEvent } from "../../engine/scene/events/ScenePointerDownEvent";
import { ScenePointerMoveEvent } from "../../engine/scene/events/ScenePointerMoveEvent";
import { ImageNode } from "../../engine/scene/ImageNode";
import { SceneNode, SceneNodeArgs } from "../../engine/scene/SceneNode";
import { Layer } from "../constants";
import { ThisIsMyDepartmentApp } from "../ThisIsMyDepartmentApp";

export class JitsiControlsNode extends SceneNode<ThisIsMyDepartmentApp> {

    @asset("images/settings.png")
    public static SettingsImage: HTMLImageElement;

    private settingsNode = new ImageNode<ThisIsMyDepartmentApp>({ image: JitsiControlsNode.SettingsImage, anchor: Direction.LEFT, x: 0 });
    private previousCursor?: string;

    public constructor(args?: SceneNodeArgs) {
        super({ anchor: Direction.TOP_LEFT, childAnchor: Direction.TOP_LEFT, layer: Layer.HUD, backgroundColor: "#666a", padding: 4,  ...args });
    }

    public update(dt: number, time: number): void {
        super.update(dt, time);
        if (this.isHoverOver && this.getGame().canvas.style.cursor !== "pointer") {
            this.previousCursor = this.getGame().canvas.style.cursor;
            this.getGame().canvas.style.cursor = "pointer";
        } else if (this.previousCursor != null && !this.isHoverOver) {
            this.getGame().canvas.style.cursor = this.previousCursor;
            this.previousCursor = undefined;
        }
    }

    protected handlePointerDown(event: ScenePointerDownEvent<ThisIsMyDepartmentApp>): void {
        let { x, y } = event.getScreenPosition();
        if (event.getButton() !== 0) {
            return;
        }

        const clickedControls = this.containsPoint(x, y);

        if (!clickedControls) {
            return;
        }

        if (clickedControls) {
            x -= this.getLeft();
            y -= this.getTop();
            if (this.settingsNode.containsPoint(x, y)) {
                this.getGame().openSettingsOverlay("media");
            }
        }

        super.handlePointerDown(event);
    }

    protected handlePointerMove(event: ScenePointerMoveEvent<ThisIsMyDepartmentApp>): void {
        const { x, y } = event.getScreenPosition();
        const isHoverOver = this.containsPoint(x, y);
        if (this.isHoverOver !== isHoverOver) {
            this.onHoverOverChange.emit(isHoverOver);
            this.isHoverOver = isHoverOver;
        }
    }

    public activate(): void {
        this.appendChild(this.settingsNode);
        this.resizeTo(this.settingsNode.width, this.settingsNode.height);
        super.activate();
    }

}
