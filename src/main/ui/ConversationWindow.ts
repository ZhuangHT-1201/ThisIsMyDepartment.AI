import { Direction } from "../../engine/geom/Direction";
import { ScenePointerDownEvent } from "../../engine/scene/events/ScenePointerDownEvent";
import { SceneNode } from "../../engine/scene/SceneNode";
import { clamp } from "../../engine/util/math";
import { Layer } from "../constants";
import type { Gather } from "../Gather";

export interface ConversationEntry {
    senderId: string;
    senderName: string;
    text: string;
    timestamp: number;
    fromSelf?: boolean;
}

export class ConversationWindow extends SceneNode<Gather> {
    private static readonly PADDING = 12;
    private static readonly HEADER_FONT = "600 14px 'Segoe UI', sans-serif";
    private static readonly BODY_FONT = "13px 'Segoe UI', sans-serif";
    private static readonly LINE_HEIGHT = 18;

    private partnerLabel: string = "";
    private visibleEntries: ConversationEntry[] = [];
    private scrollLine = 0;
    private autoScroll = true;
    private pendingScrollToBottom = true;
    private layoutCache: {
        lines: Array<{ prefix?: { text: string; color: string }; text: string; fromSelf: boolean }>;
        maxVisibleLines: number;
        maxScroll: number;
    } = { lines: [], maxVisibleLines: 0, maxScroll: 0 };
    private wheelListener?: (event: WheelEvent) => void;

    public constructor() {
        super({ anchor: Direction.TOP_RIGHT, childAnchor: Direction.TOP_LEFT, layer: Layer.HUD });

        this.resizeTo(320, 260);
        this.hideWindow();
    }

    public showConversation(partnerLabel: string, entries: ConversationEntry[]): void {
        this.partnerLabel = partnerLabel;
        this.visibleEntries = entries.slice();
        if (this.autoScroll) {
            this.pendingScrollToBottom = true;
        }
        this.invalidate();
        this.setHidden(false);
    }

    public hideWindow(): void {
        this.setHidden(true);
    }

    public layoutWithin(width: number, height: number): void {
        const margin = 16;
        this.moveTo(width - margin, margin);
    }

    public draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        if (this.isHidden()) {
            return;
        }
        ctx.save();
        ctx.fillStyle = "rgba(12, 12, 20, 0.85)";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.lineWidth = 2;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeRect(0, 0, this.width, this.height);

        const maxTextWidth = this.width - ConversationWindow.PADDING * 2;
        const headerY = ConversationWindow.PADDING;
        const bodyStartY = headerY + ConversationWindow.LINE_HEIGHT + 6;

        ctx.font = ConversationWindow.HEADER_FONT;
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`与${this.partnerLabel || ""}进行对话中`.trim(), ConversationWindow.PADDING, headerY);

        ctx.font = ConversationWindow.BODY_FONT;
        ctx.textAlign = "left";
        let y = bodyStartY;
        const lines = this.buildAllLines(ctx, maxTextWidth);
        const maxVisibleLines = Math.max(1, Math.floor((this.height - ConversationWindow.PADDING * 2 - ConversationWindow.LINE_HEIGHT - 6) / ConversationWindow.LINE_HEIGHT));
        const maxScroll = Math.max(lines.length - maxVisibleLines, 0);

        if (this.pendingScrollToBottom) {
            this.scrollLine = maxScroll;
            this.autoScroll = true;
            this.pendingScrollToBottom = false;
        } else {
            this.scrollLine = clamp(this.scrollLine, 0, maxScroll);
            if (this.scrollLine === maxScroll) {
                this.autoScroll = true;
            }
        }

        this.layoutCache = { lines, maxVisibleLines, maxScroll };

        const startIndex = this.scrollLine;
        const endIndex = Math.min(startIndex + maxVisibleLines, lines.length);
        const visibleLines = lines.slice(startIndex, endIndex);

        for (const line of visibleLines) {
            if (line.prefix) {
                ctx.fillStyle = line.prefix.color;
                ctx.fillText(line.prefix.text, ConversationWindow.PADDING, y);
            }
            const offset = line.prefix ? ctx.measureText(line.prefix.text).width : 0;
            ctx.fillStyle = line.fromSelf ? "#f5f5f5" : "#d6d6ff";
            ctx.fillText(line.text, ConversationWindow.PADDING + offset, y);
            y += ConversationWindow.LINE_HEIGHT;
        }

        ctx.restore();
        super.draw(ctx, width, height);
    }

    protected activate(): void {
        super.activate();
        this.attachWheelListener();
    }

    protected deactivate(): void {
        this.detachWheelListener();
        super.deactivate();
    }

    protected handlePointerDown(event: ScenePointerDownEvent<Gather>): void {
        super.handlePointerDown(event);
        if (this.isHidden()) {
            return;
        }
        const screenPos = event.getScreenPosition();
        if (!this.containsScreenPoint(screenPos.x, screenPos.y)) {
            return;
        }
        this.autoScroll = this.layoutCache.maxScroll === 0;
        this.pendingScrollToBottom = false;
    }

    private formatTime(timestamp: number): string {
        const date = new Date(timestamp);
        return `${this.twoDigits(date.getHours())}:${this.twoDigits(date.getMinutes())}`;
    }

    private twoDigits(value: number): string {
        return value < 10 ? `0${value}` : `${value}`;
    }

    private buildAllLines(ctx: CanvasRenderingContext2D, maxWidth: number): Array<{ prefix?: { text: string; color: string }; text: string; fromSelf: boolean }> {
        if (this.visibleEntries.length === 0) {
            return [{ text: "(No messages yet)", fromSelf: false }];
        }

        const lines: Array<{ prefix?: { text: string; color: string }; text: string; fromSelf: boolean }> = [];
        ctx.save();
        ctx.font = ConversationWindow.BODY_FONT;
        ctx.textBaseline = "top";

        for (const entry of this.visibleEntries) {
            const fromSelf = !!entry.fromSelf;
            const senderLabel = fromSelf ? "You" : entry.senderName;
            const timePart = this.formatTime(entry.timestamp);
            const prefixText = `${timePart} ${senderLabel}: `;
            const prefixWidth = ctx.measureText(prefixText).width;
            const availableWidthFirstLine = Math.max(maxWidth - prefixWidth, maxWidth * 0.3);
            const content = entry.text || "";
            let remaining = content;
            let firstLine = true;

            if (content.length === 0) {
                lines.push({
                    prefix: { text: prefixText, color: fromSelf ? "#90e0ff" : "#b8b8ff" },
                    text: "",
                    fromSelf
                });
                continue;
            }

            while (remaining.length > 0) {
                const available = firstLine ? availableWidthFirstLine : maxWidth;
                const { line, rest } = this.splitLine(ctx, remaining, available);
                lines.push({
                    prefix: firstLine ? { text: prefixText, color: fromSelf ? "#90e0ff" : "#b8b8ff" } : undefined,
                    text: line,
                    fromSelf
                });
                remaining = rest;
                firstLine = false;
            }
        }

        ctx.restore();
        return lines;
    }

    private splitLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): { line: string; rest: string } {
        if (!text) {
            return { line: "", rest: "" };
        }

        let current = "";
        let lastBreakIndex = -1;
        let lastBreakText = "";

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const tentative = current + char;
            const width = ctx.measureText(tentative).width;
            if (width > maxWidth) {
                if (current.length === 0) {
                    return {
                        line: char,
                        rest: text.slice(i + 1)
                    };
                }
                if (lastBreakIndex >= 0) {
                    return {
                        line: lastBreakText,
                        rest: text.slice(lastBreakIndex + 1).replace(/^\s+/, "")
                    };
                }
                return {
                    line: current,
                    rest: text.slice(i).replace(/^\s+/, "")
                };
            }
            current = tentative;
            if (char === " " || char === "\u3000") {
                lastBreakIndex = i;
                lastBreakText = current.trimEnd();
            }
        }

        return { line: current, rest: "" };
    }

    private scrollBy(deltaLines: number): void {
        if (deltaLines === 0) {
            return;
        }
        this.pendingScrollToBottom = false;
        const maxScroll = this.layoutCache.maxScroll;
        if (maxScroll <= 0) {
            this.scrollLine = 0;
            this.autoScroll = true;
            return;
        }
        const next = clamp(this.scrollLine + deltaLines, 0, maxScroll);
        this.autoScroll = next === maxScroll;
        if (next === this.scrollLine) {
            return;
        }
        this.scrollLine = next;
        this.invalidate();
    }

    private attachWheelListener(): void {
        const scene = this.getScene();
        if (!scene || this.wheelListener) {
            return;
        }
        const canvas = scene.game.canvas;
        this.wheelListener = (event: WheelEvent) => {
            if (this.isHidden()) {
                return;
            }
            if (!this.isWheelEventInside(event)) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (event.deltaY === 0) {
                return;
            }
            const magnitude = Math.max(1, Math.round(Math.abs(event.deltaY) / 40));
            const direction = event.deltaY > 0 ? 1 : -1;
            this.autoScroll = false;
            this.scrollBy(direction * magnitude * 2);
        };
        canvas.addEventListener("wheel", this.wheelListener, { passive: false });
    }

    private detachWheelListener(): void {
        const scene = this.getScene();
        if (!scene || !this.wheelListener) {
            return;
        }
        scene.game.canvas.removeEventListener("wheel", this.wheelListener);
        this.wheelListener = undefined;
    }

    private isWheelEventInside(event: WheelEvent): boolean {
        const scene = this.getScene();
        if (!scene) {
            return false;
        }
        const canvas = scene.game.canvas;
        const scaleX = canvas.offsetWidth === 0 ? 1 : canvas.width / canvas.offsetWidth;
        const scaleY = canvas.offsetHeight === 0 ? 1 : canvas.height / canvas.offsetHeight;
        const screenX = event.offsetX * scaleX;
        const screenY = event.offsetY * scaleY;
        return this.containsScreenPoint(screenX, screenY);
    }

    private containsScreenPoint(x: number, y: number): boolean {
        const bounds = this.getSceneBounds();
        return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
    }
}
