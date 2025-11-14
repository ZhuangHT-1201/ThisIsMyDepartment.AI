import { FontJSON } from "*.font.json";
import { loadImage } from "../util/graphics.js";

const CHAR_SPACING = 1;

export class BitmapFont {
    private sourceImage: HTMLImageElement;
    private canvas: HTMLCanvasElement;
    private colorMap: Record<string, number>;
    private charMap: string;
    private charWidths: number[];
    private compactablePrecursors: string[][];
    private charStartPoints: number[];
    private charCount: number;
    private charReverseMap: Record<string, number>;
    public charHeight!: number;

    private constructor(
        sourceImage: HTMLImageElement, colors: Record<string, string>, charMap: string,
        charHeight: number, charWidths: number[], compactablePrecursors: string[][], charMargin = 1
    ) {
        this.sourceImage = sourceImage;
        this.canvas = document.createElement("canvas");
        this.charMap = charMap;
        this.charHeight = charHeight;
        this.colorMap = this.prepareColors(colors);
        this.charWidths = charWidths;
        this.compactablePrecursors = compactablePrecursors;
        this.charStartPoints = [];
        this.charCount = charMap.length;
        this.charReverseMap = {};

        for (let i = 0; i < this.charCount; i++) {
            this.charStartPoints[i] = (i === 0) ? 0 : this.charStartPoints[i - 1] + this.charWidths[i - 1] + charMargin;
            const char = this.charMap[i];
            this.charReverseMap[char] = i;
        }
    }

    /**
     * Loads the sprite from the given source.
     *
     * @param source - The URL pointing to the JSON file of the sprite.
     * @return The loaded sprite.
     */
    public static async load(source: string): Promise<BitmapFont> {
        const json = await (await fetch(source)).json() as FontJSON;
        const baseURL = new URL(source, location.href);
        const image = await loadImage(new URL(json.image, baseURL));
        const characters = json.characterMapping.map(charDef => charDef.char).join("");
        const widths = json.characterMapping.map(charDef => charDef.width);
        const compactablePrecursors = json.characterMapping.map(charDef => charDef.compactablePrecursors || []);

        return new BitmapFont(image, json.colors, characters, json.characterHeight, widths, compactablePrecursors, json.margin);
    }

    private prepareColors(colorMap: { [x: string]: string; }): { [x: string]: number } {
        const result: { [x: string]: number} = {};
        const colors = Object.keys(colorMap);
        const count = colors.length;
        const w = this.canvas.width = this.sourceImage.width;
        const h = this.charHeight;
        this.canvas.height = h * count;
        const ctx = this.canvas.getContext("2d")!;

        // Fill with font
        for (let i = 0; i < count; i++) {
            result[colors[i]] = i;
            ctx.drawImage(this.sourceImage, 0, h * i);
        }

        // Colorize
        ctx.globalCompositeOperation = "source-in";

        for (let i = 0; i < count; i++) {
            ctx.fillStyle = colorMap[colors[i]];
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, h * i, w, h);
            ctx.clip();
            ctx.fillRect(0, 0, w, h * count);
            ctx.restore();
        }

        ctx.globalCompositeOperation = "source-over";

        return result;
    }

    private getCharIndex(char: string): number {
        let charIndex = this.charReverseMap[char];

        if (charIndex == null) {
            // To signalize missing char, use last char, which is a not-def glyph
            charIndex = this.charCount - 1;
        }

        return charIndex;
    }

    private drawCharacter(ctx: CanvasRenderingContext2D, char: number, color: string): void {
        const colorIndex = this.colorMap[color];
        const charIndex = (typeof char === "number") ? char : this.getCharIndex(char);
        const charX = this.charStartPoints[charIndex], charY = colorIndex * this.charHeight;

        ctx.drawImage(
            this.canvas, charX, charY, this.charWidths[charIndex], this.charHeight,
            0, 0, this.charWidths[charIndex], this.charHeight
        );
    }

    public hasGlyph(char: string): boolean {
        return this.charReverseMap[char] != null;
    }

    public supports(text: string): boolean {
        for (const currentChar of text) {
            if (currentChar === "\n") {
                continue;
            }
            if (!this.hasGlyph(currentChar)) {
                return false;
            }
        }
        return true;
    }

    public drawText(
        ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, align = 0,
        alpha = 1, maxWidth?: number
    ): void {
        // Do nothing when no text or alpha is 0
        if (text === "" || alpha === 0) {
            return;
        }

        ctx.save();
        ctx.translate(x, y);

        // Ugly hack to correct text position to exact pixel boundary because Chrome renders broken character images
        // when exactly between two pixels (Firefox doesn't have this problem).
        if (ctx.getTransform) {
            const transform = ctx.getTransform();
            ctx.translate(
                Math.round(transform.e) - transform.e,
                Math.round(transform.f) - transform.f
            );
        }

        ctx.globalAlpha *= alpha;

    const lines = this.wrapLines(text, maxWidth);
    const totalWidth = lines.reduce((max, line) => Math.max(max, line.width), 0);
        ctx.translate(-align * totalWidth, 0);

        let precursorChar = null;

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const { text: lineText, width } = lines[lineIndex];
            ctx.save();
            ctx.translate((totalWidth - width) * align, 0);
            for (const currentChar of lineText) {
                if (currentChar === "\n") {
                    continue;
                }
                const index = this.getCharIndex(currentChar);
                const spaceReduction = precursorChar && this.compactablePrecursors[index].includes(precursorChar) ? 1 : 0;
                ctx.translate(-spaceReduction, 0);
                this.drawCharacter(ctx, index, color);
                ctx.translate(this.charWidths[index] + CHAR_SPACING, 0);
                precursorChar = currentChar;
            }
            ctx.restore();
            if (lineIndex < lines.length - 1) {
                ctx.translate(0, this.charHeight * 1.5);
                precursorChar = null;
            }
        }

        ctx.restore();
    }

    public measureText(text: string, maxWidth?: number): { width: number, height: number } {
        const lines = this.wrapLines(text, maxWidth);
        const maxLineWidth = lines.reduce((max, line) => Math.max(max, line.width), 0);
        const height = lines.length * this.charHeight * 1.5 - 0.5 * this.charHeight;
        return { width: Math.max(0, maxLineWidth - CHAR_SPACING), height };
    }

    private wrapLines(text: string, maxWidth?: number): Array<{ text: string; width: number }> {
        if (text === "") {
            return [{ text: "", width: 0 }];
        }
        const lines: Array<{ text: string; width: number }> = [];
        const hardLines = text.split("\n");
        const maxWidthPx = maxWidth ?? Infinity;
        for (const hardLine of hardLines) {
            if (hardLine.length === 0) {
                lines.push({ text: "", width: 0 });
                continue;
            }
            let currentLine = "";
            let currentWidth = 0;
            let linePrecursor: string | null = null;
            for (const char of hardLine) {
                let charWidth = this.measureSegment(char, linePrecursor);
                if (currentLine.length > 0 && currentWidth + charWidth > maxWidthPx) {
                    lines.push({ text: currentLine, width: currentWidth });
                    currentLine = "";
                    currentWidth = 0;
                    linePrecursor = null;
                    charWidth = this.measureSegment(char, linePrecursor);
                }
                if (char === " " && currentLine.length === 0) {
                    continue;
                }
                currentLine += char;
                currentWidth += charWidth;
                linePrecursor = char;
            }
            lines.push({ text: currentLine, width: currentWidth });
        }
        return lines;
    }

    private measureSegment(segment: string, precursorChar: string | null): number {
        let width = 0;
        let prevChar = precursorChar;
        for (const char of segment) {
            const index = this.getCharIndex(char);
            const spaceReduction = prevChar && this.compactablePrecursors[index].includes(prevChar) ? 1 : 0;
            width += this.charWidths[index] - spaceReduction + CHAR_SPACING;
            prevChar = char;
        }
        return width;
    }

    public drawTextWithOutline(
        ctx: CanvasRenderingContext2D, text: string, xPos: number, yPos: number, textColor: string,
        outlineColor: string, align = 0, maxWidth?: number
    ): void {
        for (let yOffset = yPos - 1; yOffset <= yPos + 1; yOffset++) {
            for (let xOffset = xPos - 1; xOffset <= xPos + 1; xOffset++) {
                if (xOffset !== xPos || yOffset !== yPos) {
                    this.drawText(ctx, text, xOffset, yOffset, outlineColor, align, 1, maxWidth);
                }
            }
        }

        this.drawText(ctx, text, xPos, yPos, textColor, align, 1, maxWidth);
    }
}
