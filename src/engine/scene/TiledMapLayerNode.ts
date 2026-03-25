import { Game } from "../Game";
import { Direction } from "../geom/Direction";
import { TiledMap } from "../tiled/TiledMap";
import { TiledTileLayer } from "../tiled/TiledTileLayer";
import { TiledTileset } from "../tiled/TiledTileset";
import { createCanvas, getRenderingContext } from "../util/graphics";
import { SceneNode, SceneNodeArgs, SceneNodeAspect } from "./SceneNode";

type TilesetEntry = {
    tileset: TiledTileset;
    image: HTMLImageElement | null;
    lastGid: number;
};

/**
 * Constructor arguments for [[TiledNode]].
 */
export interface TiledMapLayerNodeArgs extends SceneNodeArgs {
    map: TiledMap,
    name: string
}

export class TiledMapLayerNode<T extends Game> extends SceneNode<T> {
    private map: TiledMap;
    private name: string;
    private retryScheduled = false;

    /**
     * Creates a new scene node displaying the given Tiled Map.
     */
    public constructor({ map, name, ...args }: TiledMapLayerNodeArgs) {
        super({
            width: map.getWidth() * map.getTileWidth(),
            height: map.getHeight() * map.getTileHeight(),
            anchor: Direction.TOP_LEFT,
            ...args
        });
        this.map = map;
        this.name = name;
    }

    private renderedMap: HTMLCanvasElement | null = null;

    private getRenderedMap(): HTMLCanvasElement | null {
        if (this.renderedMap == null) {
            const canvas = createCanvas(this.map.getWidth() * this.map.getTileWidth(), this.map.getHeight() * this.map.getTileHeight());
            const ctx = getRenderingContext(canvas, "2d");
            const layer = this.map.getLayer(this.name, TiledTileLayer);
            const tilesetEntries: TilesetEntry[] = this.map.getTilesets().map(tileset => ({
                tileset,
                image: tileset.getImage(),
                lastGid: tileset.getFirstGID() + tileset.getTileCount()
            }));
            const data = layer.getData();
            const height = layer.getHeight();
            const width = layer.getWidth();
            let needsRetry = false;
            const cellWidth = this.map.getTileWidth();
            const cellHeight = this.map.getTileHeight();
            for (let y = layer.getY(); y < height; ++y) {
                for (let x = layer.getX(); x < width; ++x) {
                    const tile = data[y * width + x];
                    const rawTileId = tile & 0x1FFFFFFF;
                    if (rawTileId === 0) {
                        continue;
                    }
                    const entry = this.getTilesetEntry(rawTileId, tilesetEntries);
                    if (entry == null) {
                        needsRetry = true;
                        continue;
                    }
                    const tileset = entry.tileset;
                    const tileId = rawTileId - tileset.getFirstGID();
                    const flippedHorizontally = (tile & 0x80000000);
                    const flippedVertically = (tile & 0x40000000);
                    const flippedDiagonally = (tile & 0x20000000);
                    const atlasImage = entry.image;
                    if (atlasImage != null) {
                        const tileY = Math.floor(tileId / tileset.getColumns());
                        const tileX = tileId % tileset.getColumns();
                        ctx.save();
                        ctx.translate(x * cellWidth, y * cellHeight);
                        if (flippedHorizontally || flippedDiagonally) {
                            ctx.translate(tileset.getTileWidth(), 0);
                            ctx.scale(-1, 1);
                        }
                        if (flippedVertically || flippedDiagonally) {
                            ctx.translate(0, tileset.getTileHeight());
                            ctx.scale(1, -1);
                        }
                        ctx.drawImage(
                            atlasImage,
                            tileX * tileset.getTileWidth(), tileY * tileset.getTileHeight(), tileset.getTileWidth(), tileset.getTileHeight(),
                            0, 0, tileset.getTileWidth(), tileset.getTileHeight()
                        );
                        ctx.restore();
                        continue;
                    }

                    const tileImage = tileset.getTileImage(tileId);
                    const tileDefinition = tileset.getTile(tileId);
                    if (tileImage == null || tileDefinition == null) {
                        needsRetry = true;
                        continue;
                    }
                    const drawWidth = tileDefinition.imagewidth ?? tileset.getTileWidth();
                    const drawHeight = tileDefinition.imageheight ?? tileset.getTileHeight();
                    ctx.save();
                    ctx.translate(x * cellWidth, y * cellHeight + cellHeight - drawHeight);
                    if (flippedHorizontally || flippedDiagonally) {
                        ctx.translate(drawWidth, 0);
                        ctx.scale(-1, 1);
                    }
                    if (flippedVertically || flippedDiagonally) {
                        ctx.translate(0, drawHeight);
                        ctx.scale(1, -1);
                    }
                    ctx.drawImage(tileImage, 0, 0, drawWidth, drawHeight, 0, 0, drawWidth, drawHeight);
                    ctx.restore();
                }
            }
            this.renderedMap = canvas;
            if (needsRetry && !this.retryScheduled) {
                this.retryScheduled = true;
                window.setTimeout(() => {
                    this.retryScheduled = false;
                    this.renderedMap = null;
                    this.invalidate(SceneNodeAspect.RENDERING);
                }, 50);
            }
        }
        return this.renderedMap;
    }

    public draw(ctx: CanvasRenderingContext2D): void {
        const renderedMap = this.getRenderedMap();
        if (renderedMap != null) {
            ctx.drawImage(renderedMap, 0, 0);
        }
    }

    private getTilesetEntry(gid: number, entries: TilesetEntry[]): TilesetEntry | null {
        for (let i = entries.length - 1; i >= 0; --i) {
            const entry = entries[i];
            if (gid >= entry.tileset.getFirstGID() && gid < entry.lastGid) {
                return entry;
            }
        }
        return null;
    }
}
