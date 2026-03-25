import { Game } from "../Game";
import { SceneNode, SceneNodeArgs } from "./SceneNode";
import { BitmapFont } from "../assets/BitmapFont";

/**
 * Constructor arguments for [[TextNode]].
 */
export interface TextNodeArgs extends SceneNodeArgs {
    /** The initial font used to draw the text. */
    font: BitmapFont;

    /** Optional initial text to draw. Defaults to empty string. */
    text?: string;

    /** Optional initial text color. Defaults to "white". */
    color?: string;

    /** Optional initial outline text color. Default is null which means no outline is drawn. */
    outlineColor?: string | null;

    /** Optional CSS font string used when characters are not available in the bitmap font. */
    fallbackFont?: string;

    /** Optional line height to use with the fallback font (in pixels). */
    fallbackLineHeight?: number;

    /** Optional maximum width before text wraps to a new line. */
    maxWidth?: number;
}

/**
 * Scene node for displaying a text with an optional icon left to it.
 *
 * @param T - Optional owner game class.
 */
export class TextNode<T extends Game = Game> extends SceneNode<T> {
    /** The font used to draw the text. */
    private font: BitmapFont;

    /** The text to draw. */
    private text: string;

    /** The text color. */
    private color: string;

    /** Optional outline color. */
    private outlineColor: string | null;

    /** Optional CSS fallback font when bitmap glyphs are missing. */
    private fallbackFont?: string;

    /** Line height for fallback rendering. */
    private fallbackLineHeight: number;

    private useFallbackFont = false;
    private customFallbackLineHeight = false;

    private maxWidth?: number;

    /**
     * Creates a new scene node displaying the given image.
     */
    public constructor({ font, text = "", color = "white", outlineColor = null, fallbackFont, fallbackLineHeight, maxWidth, ...args } : TextNodeArgs) {
        super(args);
        this.font = font;
        this.text = text;
        this.color = color;
        this.outlineColor = outlineColor;
        this.fallbackFont = fallbackFont;
        if (fallbackLineHeight != null) {
            this.fallbackLineHeight = fallbackLineHeight;
            this.customFallbackLineHeight = true;
        } else {
            this.fallbackLineHeight = this.deriveFallbackLineHeight();
        }
        this.maxWidth = maxWidth;
        this.updateSize();
    }

    /**
     * Returns the displayed text.
     *
     * @return The displayed text.
     */
    public getText(): string {
        return this.text;
    }

    /**
     * Sets the displayed text.
     *
     * @param text - The text to set.
     */
    public setText(text: string): this {
        if (text !== this.text) {
            this.text = text;
            this.updateSize();
            this.invalidate();
        }
        return this;
    }

    /**
     * Returns the bitmap font used to draw the text.
     *
     * @return The used bitmap font.
     */
    public getFont(): BitmapFont {
        return this.font;
    }

    /**
     * Sets the bitmap font used to draw the text.
     *
     * @param font - The bitmap font to use.
     */
    public setFont(font: BitmapFont): this {
        if (font !== this.font) {
            this.font = font;
            if (!this.customFallbackLineHeight) {
                this.fallbackLineHeight = this.deriveFallbackLineHeight();
            }
            this.updateSize();
            this.invalidate();
        }
        return this;
    }

    /**
     * Returns the text color.
     *
     * @return The text color.
     */
    public getColor(): string {
        return this.color;
    }

    /**
     * Sets the text color.
     *
     * @param color - The text color to set.
     */
    public setColor(color: string): this {
        if (color !== this.color) {
            this.color = color;
            this.invalidate();
        }
        return this;
    }

    /**
     * Returns the text outline color. Null if none.
     *
     * @return The text outline color. Null if none.
     */
    public getOutlineColor(): string | null {
        return this.outlineColor;
    }

    /**
     * Sets the text outline color.
     *
     * @param outlineColor - The text outline color to set.
     */
    public setOutlineColor(outlineColor: string | null): this {
        if (outlineColor !== this.outlineColor) {
            this.outlineColor = outlineColor;
            this.invalidate();
        }
        return this;
    }

    /**
     * Sets the maximum width before text wraps to a new line.
     */
    public setMaxWidth(maxWidth?: number): this {
        if (this.maxWidth !== maxWidth) {
            this.maxWidth = maxWidth;
            this.updateSize();
            this.invalidate();
        }
        return this;
    }

    /**
     * Updates the node size according to the text measurements.
     */
    private updateSize(): void {
        this.useFallbackFont = this.shouldUseFallback(this.text);
        if (this.useFallbackFont) {
            const size = this.measureWithFallback(this.text);
            this.resizeTo(size.width, size.height);
        } else {
            const size = this.font.measureText(this.text, this.maxWidth);
            this.resizeTo(size.width, size.height);
        }
    }

    /** @inheritDoc */
    public draw(ctx: CanvasRenderingContext2D): void {
        if (this.useFallbackFont) {
            this.drawWithFallback(ctx);
            return;
        }
        if (this.outlineColor != null) {
            this.font.drawTextWithOutline(ctx, this.text, 0, 0, this.color, this.outlineColor, 0, this.maxWidth);
        } else {
            this.font.drawText(ctx, this.text, 0, 0, this.color, 0, 1, this.maxWidth);
        }
    }

    private shouldUseFallback(text: string): boolean {
        if (!this.fallbackFont) {
            return false;
        }
        if (!text) {
            return false;
        }
        for (const char of text) {
            if (char === "\n") {
                continue;
            }
            if (char.charCodeAt(0) > 0x7f) {
                return true;
            }
        }
        return !this.font.supports(text);
    }

    private measureWithFallback(text: string): { width: number; height: number } {
        if (!text) {
            return { width: 0, height: this.fallbackLineHeight };
        }
        const ctx = TextNode.getMeasurementContext();
        ctx.font = this.fallbackFont ?? TextNode.getDefaultFallbackFont();
        const lines = this.wrapFallbackText(text, ctx);
        let maxWidth = 0;
        for (const line of lines) {
            const metrics = ctx.measureText(line);
            const width = metrics.width;
            if (width > maxWidth) {
                maxWidth = width;
            }
        }
        const height = lines.length * this.fallbackLineHeight;
        return { width: Math.ceil(maxWidth), height: Math.ceil(height) };
    }

    private drawWithFallback(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        ctx.font = this.fallbackFont ?? TextNode.getDefaultFallbackFont();
        ctx.fillStyle = this.color;
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        if (ctx.getTransform) {
            const transform = ctx.getTransform();
            ctx.translate(
                Math.round(transform.e) - transform.e,
                Math.round(transform.f) - transform.f
            );
        }
        const lines = this.wrapFallbackText(this.text, ctx);
        let y = 0;
        if (this.outlineColor) {
            ctx.strokeStyle = this.outlineColor;
            ctx.lineWidth = 2;
            for (const line of lines) {
                if (line) {
                    ctx.strokeText(line, 0, y);
                }
                y += this.fallbackLineHeight;
            }
            y = 0;
        }
        for (const line of lines) {
            if (line) {
                ctx.fillText(line, 0, y);
            }
            y += this.fallbackLineHeight;
        }
        ctx.restore();
    }

    private deriveFallbackLineHeight(): number {
        return Math.ceil(this.font.charHeight * 1.4);
    }

    private static measurementCanvas?: HTMLCanvasElement;
    private static measurementContext?: CanvasRenderingContext2D;

    private static getMeasurementContext(): CanvasRenderingContext2D {
        if (!TextNode.measurementContext) {
            TextNode.measurementCanvas = document.createElement("canvas");
            const ctx = TextNode.measurementCanvas.getContext("2d");
            if (!ctx) {
                throw new Error("Unable to create text measurement context");
            }
            TextNode.measurementContext = ctx;
        }
        return TextNode.measurementContext;
    }

    private static getDefaultFallbackFont(): string {
        return "16px 'SF Pro Text', 'Helvetica Neue', Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif";
    }

    private wrapFallbackText(text: string, ctx: CanvasRenderingContext2D): string[] {
        const maxWidth = this.maxWidth ?? Infinity;
        if (text === "") {
            return [""];
        }
        const hardLines = text.split("\n");
        const lines: string[] = [];
        for (const hardLine of hardLines) {
            if (hardLine.length === 0) {
                lines.push("");
                continue;
            }
            let currentLine = "";
            for (const char of Array.from(hardLine)) {
                let nextLine = currentLine + char;
                if (currentLine.length > 0 && maxWidth !== Infinity && ctx.measureText(nextLine).width > maxWidth) {
                    lines.push(currentLine);
                    currentLine = "";
                    nextLine = char;
                    if (char === " ") {
                        continue;
                    }
                }
                if (char === " " && currentLine.length === 0) {
                    continue;
                }
                currentLine = nextLine;
            }
            lines.push(currentLine);
        }
        return lines.length > 0 ? lines : [""];
    }
}
