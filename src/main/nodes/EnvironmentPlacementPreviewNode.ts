import { SceneNode } from "../../engine/scene/SceneNode";
import { ThisIsMyDepartmentApp } from "../ThisIsMyDepartmentApp";

type EnvironmentPlacementMode = "position" | "walk-area";

interface EnvironmentPlacementPreviewNodeArgs {
    spriteIndex: number;
    displayName: string;
    position: { x: number; y: number };
    walkArea?: { x: number; y: number; width: number; height: number };
    mode: EnvironmentPlacementMode;
}

export class EnvironmentPlacementPreviewNode extends SceneNode<ThisIsMyDepartmentApp> {
    private spriteIndex: number;
    private displayName: string;
    private avatarPosition: { x: number; y: number };
    private currentWalkArea?: { x: number; y: number; width: number; height: number };
    private pendingWalkArea?: { x: number; y: number; width: number; height: number };
    private mode: EnvironmentPlacementMode;

    public constructor(args: EnvironmentPlacementPreviewNodeArgs) {
        super({
            id: `environment-placement-preview-${args.displayName}`,
            x: 0,
            y: 0,
            width: 0,
            height: 0
        });
        this.spriteIndex = args.spriteIndex;
        this.displayName = args.displayName;
        this.avatarPosition = { ...args.position };
        this.currentWalkArea = args.walkArea ? { ...args.walkArea } : undefined;
        this.mode = args.mode;
        this.setOpacity(0.96);
    }

    public setAvatarPosition(position: { x: number; y: number }): void {
        this.avatarPosition = { ...position };
    }

    public setWalkArea(walkArea?: { x: number; y: number; width: number; height: number }): void {
        this.currentWalkArea = walkArea ? { ...walkArea } : undefined;
    }

    public setPendingWalkArea(walkArea?: { x: number; y: number; width: number; height: number }): void {
        this.pendingWalkArea = walkArea ? { ...walkArea } : undefined;
    }

    public setPlacementMode(mode: EnvironmentPlacementMode): void {
        this.mode = mode;
    }

    public draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        const accent = this.mode === "position" ? "#7eb6ff" : "#7bf0d0";
        const sprite = ThisIsMyDepartmentApp.characterSprites[this.spriteIndex] ?? ThisIsMyDepartmentApp.characterSprites[0];

        ctx.save();

        if (this.currentWalkArea) {
            ctx.save();
            ctx.fillStyle = "rgba(123, 240, 208, 0.12)";
            ctx.strokeStyle = "rgba(123, 240, 208, 0.92)";
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.fillRect(this.currentWalkArea.x, this.currentWalkArea.y, this.currentWalkArea.width, this.currentWalkArea.height);
            ctx.strokeRect(this.currentWalkArea.x, this.currentWalkArea.y, this.currentWalkArea.width, this.currentWalkArea.height);
            ctx.restore();
        }

        if (this.pendingWalkArea) {
            ctx.save();
            ctx.fillStyle = "rgba(255, 196, 107, 0.16)";
            ctx.strokeStyle = "rgba(255, 214, 140, 0.98)";
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 5]);
            ctx.fillRect(this.pendingWalkArea.x, this.pendingWalkArea.y, this.pendingWalkArea.width, this.pendingWalkArea.height);
            ctx.strokeRect(this.pendingWalkArea.x, this.pendingWalkArea.y, this.pendingWalkArea.width, this.pendingWalkArea.height);
            ctx.restore();
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(this.avatarPosition.x, this.avatarPosition.y, 11, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(7, 12, 20, 0.82)";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = accent;
        ctx.stroke();
        ctx.restore();

        if (sprite) {
            ctx.save();
            ctx.translate(
                Math.round(this.avatarPosition.x - sprite.width / 2),
                Math.round(this.avatarPosition.y - sprite.height + 4)
            );
            sprite.draw(ctx, 0, 0, performance.now());
            ctx.restore();
        }

        ctx.save();
        ctx.font = "600 12px 'Segoe UI', 'PingFang SC', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        const labelY = this.avatarPosition.y - (sprite?.height ?? 28) - 8;
        const labelWidth = Math.max(90, ctx.measureText(this.displayName).width + 16);
        ctx.fillStyle = "rgba(7, 12, 20, 0.82)";
        ctx.fillRect(this.avatarPosition.x - labelWidth / 2, labelY - 18, labelWidth, 18);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        ctx.strokeRect(this.avatarPosition.x - labelWidth / 2, labelY - 18, labelWidth, 18);
        ctx.fillStyle = "#eef3ff";
        ctx.fillText(this.displayName, this.avatarPosition.x, labelY - 4);
        ctx.restore();

        ctx.restore();
        super.draw(ctx, width, height);
    }
}