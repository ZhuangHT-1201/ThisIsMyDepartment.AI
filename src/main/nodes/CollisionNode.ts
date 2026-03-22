import { Direction } from "../../engine/geom/Direction";
import { Bounds2 } from "../../engine/graphics/Bounds2";
import { Vector2 } from "../../engine/graphics/Vector2";
import { SceneNode, SceneNodeArgs } from "../../engine/scene/SceneNode";
import { ThisIsMyDepartmentApp } from "../ThisIsMyDepartmentApp";

export class CollisionNode extends SceneNode<ThisIsMyDepartmentApp> {
    public constructor(args?: SceneNodeArgs) {
        super({ anchor: Direction.TOP_LEFT, ...args });
        // this.setShowBounds(true);
    }

    public store: string = "";

    public collidesWithRectangle(x1: Bounds2): boolean;
    public collidesWithRectangle(x1: number, y1: number, x2: number, y2: number): boolean;
    public collidesWithRectangle(x1: number | Bounds2, y1: number = 0, w: number = 0, h: number = 0): boolean {
        if (x1 instanceof Bounds2) {
            y1 = x1.minY;
            w = x1.width;
            h = x1.height;
            x1 = x1.minX;
        }
        const collider = this.getColliderPolygon();
        const rectangle = this.getRectanglePolygon(x1, y1, w, h);
        return this.polygonsOverlap(collider, rectangle);
    }

    public containsPoint(x: number, y: number): boolean {
        const polygon = this.getColliderPolygon();
        return this.pointInPolygon(x, y, polygon);
    }

    private getColliderPolygon(): Vector2[] {
        const transform = this.getSceneTransformation();
        const width = this.width;
        const height = this.height;
        return [
            new Vector2(0, 0).mul(transform),
            new Vector2(width, 0).mul(transform),
            new Vector2(width, height).mul(transform),
            new Vector2(0, height).mul(transform)
        ];
    }

    private getRectanglePolygon(x: number, y: number, width: number, height: number): Vector2[] {
        return [
            new Vector2(x, y),
            new Vector2(x + width, y),
            new Vector2(x + width, y + height),
            new Vector2(x, y + height)
        ];
    }

    private polygonsOverlap(a: Vector2[], b: Vector2[]): boolean {
        const axes = [...this.getAxes(a), ...this.getAxes(b)];
        for (const axis of axes) {
            if (axis.x === 0 && axis.y === 0) {
                continue;
            }
            axis.normalize();
            const projA = this.projectOntoAxis(a, axis);
            const projB = this.projectOntoAxis(b, axis);
            if (projA.max < projB.min || projB.max < projA.min) {
                return false;
            }
        }
        return true;
    }

    private getAxes(points: Vector2[]): Vector2[] {
        const axes: Vector2[] = [];
        for (let i = 0; i < points.length; ++i) {
            const p1 = points[i];
            const p2 = points[(i + 1) % points.length];
            const edge = new Vector2(p2.x - p1.x, p2.y - p1.y);
            axes.push(new Vector2(-edge.y, edge.x));
        }
        return axes;
    }

    private projectOntoAxis(points: Vector2[], axis: Vector2): { min: number; max: number } {
        let min = points[0].dot(axis);
        let max = min;
        for (let i = 1; i < points.length; ++i) {
            const projection = points[i].dot(axis);
            min = Math.min(min, projection);
            max = Math.max(max, projection);
        }
        return { min, max };
    }

    private pointInPolygon(x: number, y: number, polygon: Vector2[]): boolean {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x;
            const yi = polygon[i].y;
            const xj = polygon[j].x;
            const yj = polygon[j].y;
            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi || Number.EPSILON) + xi);
            if (intersect) {
                inside = !inside;
            }
        }
        return inside;
    }
}
