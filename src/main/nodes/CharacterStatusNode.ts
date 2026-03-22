import { BitmapFont } from "../../engine/assets/BitmapFont";
import { asset } from "../../engine/assets/Assets";
import { Direction } from "../../engine/geom/Direction";
import { SceneNode, SceneNodeArgs } from "../../engine/scene/SceneNode";
import { TextNode } from "../../engine/scene/TextNode";
import { Layer, SMALL_FONT, STANDARD_FONT } from "../constants";
import { ThisIsMyDepartmentApp } from "../ThisIsMyDepartmentApp";

export class CharacterStatusNode extends SceneNode<ThisIsMyDepartmentApp> {
    @asset(STANDARD_FONT)
    private static readonly titleFont: BitmapFont;

    @asset(SMALL_FONT)
    private static readonly bodyFont: BitmapFont;

    private static readonly PADDING = 8;
    private static readonly GAP = 6;
    private static readonly MAX_CONTENT_WIDTH = 196;

    private readonly titleNode = new TextNode<ThisIsMyDepartmentApp>({
        font: CharacterStatusNode.titleFont,
        text: "Character Status",
        color: "#f2e7c6",
        outlineColor: "#1b1610",
        anchor: Direction.TOP_LEFT
    });

    private readonly detailsNode = new TextNode<ThisIsMyDepartmentApp>({
        font: CharacterStatusNode.bodyFont,
        text: "",
        color: "#f3f5f7",
        anchor: Direction.TOP_LEFT,
        fallbackFont: "12px monospace",
        fallbackLineHeight: 14,
        maxWidth: CharacterStatusNode.MAX_CONTENT_WIDTH
    });

    private lastSnapshot = "";

    public constructor(args?: SceneNodeArgs) {
        super({
            anchor: Direction.TOP_LEFT,
            childAnchor: Direction.TOP_LEFT,
            layer: Layer.HUD,
            backgroundColor: "#1d2430dd",
            ...args
        });
    }

    public activate(): void {
        this.appendChild(this.titleNode);
        this.appendChild(this.detailsNode);
        this.syncContent();
        super.activate();
    }

    protected draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        this.syncContent();
        super.draw(ctx, width, height);
    }

    private syncContent(): void {
        const snapshot = this.buildSnapshot();
        if (snapshot === this.lastSnapshot) {
            return;
        }

        this.lastSnapshot = snapshot;
        this.detailsNode.setText(snapshot);
        this.layoutNodes();
    }

    private buildSnapshot(): string {
        const app = this.getGame();
        const currentUser = app.getCurrentUser();
        const profile = app.getCurrentUserProfile();
        const lines: string[] = [];

        lines.push(`Name: ${currentUser?.displayName ?? app.userName ?? "Guest"}`);
        lines.push(`User ID: ${currentUser?.userId ?? app.userId}`);

        const affiliation = [currentUser?.organization, currentUser?.department].filter(Boolean).join(" / ");
        if (affiliation) {
            lines.push(`Affiliation: ${affiliation}`);
        }

        const roles = currentUser?.roles?.filter(Boolean) ?? [];
        if (roles.length > 0) {
            lines.push(`Roles: ${roles.join(", ")}`);
        }

        if (profile?.avatar) {
            lines.push(`Avatar: ${profile.avatar.spriteIndex + 1}`);
        }

        lines.push(`Offline AI: ${profile?.characterSystemPrompt?.trim() ? "configured" : "default"}`);
        return lines.join("\n");
    }

    private layoutNodes(): void {
        const padding = CharacterStatusNode.PADDING;
        const gap = CharacterStatusNode.GAP;

        this.titleNode.moveTo(padding, padding);
        this.detailsNode.moveTo(padding, padding + this.titleNode.height + gap);

        const contentWidth = Math.max(this.titleNode.width, this.detailsNode.width);
        const contentHeight = this.titleNode.height + gap + this.detailsNode.height;
        this.resizeTo(contentWidth + padding * 2, contentHeight + padding * 2);
    }
}