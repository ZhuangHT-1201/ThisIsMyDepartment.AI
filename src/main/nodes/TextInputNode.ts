import { Game } from "../../engine/Game";
import { Direction } from "../../engine/geom/Direction";
import { ScenePointerDownEvent } from "../../engine/scene/events/ScenePointerDownEvent";
import { SceneNode } from "../../engine/scene/SceneNode";
import { TiledSceneArgs } from "../../engine/scene/TiledMapNode";
import { Signal } from "../../engine/util/Signal";

export class TextInputNode<T extends Game = Game> extends SceneNode<T> {
    private static readonly FONT = "14px 'Segoe UI', sans-serif";
    private static readonly PADDING_X = 12;
    private static readonly PADDING_Y = 8;
    private static readonly LINE_HEIGHT = 20;
    private static measurementCtx?: CanvasRenderingContext2D;

    public active = false;
    public onTextSubmit = new Signal<string>();
    public onTextChange = new Signal<string>();
    private cursorPosition: number;
    private startTime = 0;
    private detachDomInput?: () => void;

    public constructor(public text = "", public placeholder = "TYPE HERE", private maxLength?: number, private filterValues = true, args?: TiledSceneArgs) {
        super({ anchor: Direction.CENTER, childAnchor: Direction.CENTER, ...args });
        this.updateDimensions();
        this.updatePlaceholder();
        this.cursorPosition = text.length;
    }

    public focus(): void {
        this.getGame().keyboard.blockInput = this;
        this.active = true;
        this.attachDomInput();
    }

    public blur(): void {
        if (this.isInScene()) {
            this.getGame().keyboard.blockInput = undefined;
            this.detachDomInput?.();
            this.detachDomInput = undefined;
            this.onTextSubmit.emit(this.text);
        }
        this.active = false;
    }

    private updatePlaceholder(): void {
        this.updateDimensions();
        this.invalidate();
    }

    protected handlePointerDown(event: ScenePointerDownEvent<T>): void {
        super.handlePointerDown(event);
        const scenePosition = this.getScenePosition();
        const sceneBounds = this.getSceneBounds().toRect().translate(scenePosition.x, scenePosition.y - this.getSceneBounds().minY - this.height / 2);
        const eventPosition = event.getScreenPosition();
        const containsCursor = sceneBounds.containsPoint(eventPosition.x, eventPosition.y);
        if (containsCursor) {
            if (!this.active) {
                this.focus();
            }
            return;
        }

        if (this.active) {
            const game = this.getGame() as Game & { isPointerOverUi?: (sceneX: number, sceneY: number) => boolean };
            const x = event.getX();
            const y = event.getY();
            if (typeof game.isPointerOverUi === "function" && game.isPointerOverUi(x, y)) {
                return;
            }
            this.blur();
        }
    }

    public update(dt: number, time: number): void {
        super.update(dt, time);
        this.startTime += dt;
    }

    public draw(ctx: CanvasRenderingContext2D ,width: number, height: number): void {
        ctx.save();
        ctx.font = TextInputNode.FONT;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        const textY = this.height / 2;
        const textX = TextInputNode.PADDING_X;
        const displayText = this.text.length > 0 ? this.text : this.placeholder;
        ctx.fillStyle = this.text.length > 0 ? "#ffffff" : "#b0b0b0";
        ctx.fillText(displayText, textX, textY);

        if (this.active && Math.round(this.startTime) % 2 === 0) {
            const caretX = Math.min(textX + this.measureCaretOffset(), this.width - TextInputNode.PADDING_X);
            const caretHeight = TextInputNode.LINE_HEIGHT * 0.8;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(Math.round(caretX), (this.height - caretHeight) / 2, 1, caretHeight);
        }
        ctx.restore();
        super.draw(ctx, width, height);
    }

    public setText(text: string): void {
        this.text = text;
        this.cursorPosition = Array.from(this.text).length;
        this.updatePlaceholder();
    }

    private attachDomInput(): void {
        const input = document.createElement("input");
        input.type = "text";
        input.style.position = "fixed";
        input.style.opacity = "0";
        input.style.pointerEvents = "none";
        input.style.width = "1px";
        input.style.height = "1px";
        input.style.left = "-9999px";
        input.autocomplete = "off";
        input.autocapitalize = "off";
        input.spellcheck = false;
        document.body.appendChild(input);

        input.value = this.text;
        const initialCaret = Math.min(this.cursorPosition, input.value.length);
        input.setSelectionRange(initialCaret, initialCaret);

        const syncFromInput = () => {
            let value = input.value;
            if (this.filterValues) {
                value = Array.from(value).filter(isValidCharacter).join("");
            }
            if (this.maxLength != null) {
                const characters = Array.from(value);
                if (characters.length > this.maxLength) {
                    value = characters.slice(0, this.maxLength).join("");
                }
            }
            if (value !== input.value) {
                const caret = Math.min(input.selectionEnd ?? value.length, value.length);
                input.value = value;
                input.setSelectionRange(caret, caret);
            }
            this.text = value;
            const caretPosition = input.selectionEnd ?? value.length;
            const codepointLength = Array.from(this.text).length;
            this.cursorPosition = Math.min(caretPosition, codepointLength);
            this.onTextChange.emit(this.text);
            this.updatePlaceholder();
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Enter") {
                event.preventDefault();
                this.blur();
            } else if (event.key === "Escape") {
                event.preventDefault();
                input.value = "";
                syncFromInput();
            }
        };

        const handleSelectionChange = () => {
            if (document.activeElement === input) {
                this.cursorPosition = input.selectionEnd ?? input.value.length;
            }
        };

        input.addEventListener("input", syncFromInput);
        input.addEventListener("keydown", handleKeyDown);
        document.addEventListener("selectionchange", handleSelectionChange);

        this.detachDomInput = () => {
            input.removeEventListener("input", syncFromInput);
            input.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("selectionchange", handleSelectionChange);
            input.remove();
        };

        requestAnimationFrame(() => {
            input.focus();
            syncFromInput();
        });
    }

    private measureCaretOffset(): number {
        const ctx = TextInputNode.getMeasurementContext();
        ctx.font = TextInputNode.FONT;
        const prefix = Array.from(this.text).slice(0, this.cursorPosition).join("");
        return ctx.measureText(prefix).width;
    }

    private updateDimensions(): void {
        const ctx = TextInputNode.getMeasurementContext();
        ctx.font = TextInputNode.FONT;
        const reference = this.text.length > 0 ? this.text : this.placeholder;
        const measured = ctx.measureText(reference || " ");
        const width = Math.max(220, measured.width + TextInputNode.PADDING_X * 2);
        const height = TextInputNode.LINE_HEIGHT + TextInputNode.PADDING_Y * 2;
        this.resizeTo(width, height);
    }

    private static getMeasurementContext(): CanvasRenderingContext2D {
        if (!TextInputNode.measurementCtx) {
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            if (!context) {
                throw new Error("Unable to create measurement context");
            }
            TextInputNode.measurementCtx = context;
        }
        return TextInputNode.measurementCtx;
    }
}

function isValidCharacter(str: string): boolean {
    const chars = Array.from(str);
    if (chars.length !== 1) {
        return false;
    }
    const code = chars[0].codePointAt(0) ?? 0;
    // Disallow control characters but allow full Unicode range for user text (e.g. Chinese, emoji)
    return code >= 32 && code !== 127;
}
