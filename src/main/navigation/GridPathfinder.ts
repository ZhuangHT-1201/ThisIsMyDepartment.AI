import { Vector2 } from "../../engine/graphics/Vector2";

interface GridCell {
    col: number;
    row: number;
}

export interface GridPathfinderOptions {
    start: { x: number; y: number };
    goal: { x: number; y: number };
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    cellSize: number;
    isBlocked: (x: number, y: number) => boolean;
}

interface OpenNode extends GridCell {
    key: string;
    gScore: number;
    fScore: number;
}

interface GridDirection {
    col: number;
    row: number;
    cost: number;
}

const buildCellKey = (col: number, row: number): string => `${col},${row}`;
const straightMoveCost = 1;
const diagonalMoveCost = Math.SQRT2;
const directions: GridDirection[] = [
    { col: 1, row: 0, cost: straightMoveCost },
    { col: -1, row: 0, cost: straightMoveCost },
    { col: 0, row: 1, cost: straightMoveCost },
    { col: 0, row: -1, cost: straightMoveCost },
    { col: 1, row: 1, cost: diagonalMoveCost },
    { col: 1, row: -1, cost: diagonalMoveCost },
    { col: -1, row: 1, cost: diagonalMoveCost },
    { col: -1, row: -1, cost: diagonalMoveCost }
];

const clamp = (value: number, min: number, max: number): number => {
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
};

const toGridCell = (x: number, y: number, options: GridPathfinderOptions): GridCell => {
    const usableWidth = Math.max(options.cellSize, options.maxX - options.minX);
    const usableHeight = Math.max(options.cellSize, options.maxY - options.minY);
    const maxCol = Math.max(0, Math.ceil(usableWidth / options.cellSize) - 1);
    const maxRow = Math.max(0, Math.ceil(usableHeight / options.cellSize) - 1);

    return {
        col: clamp(Math.floor((x - options.minX) / options.cellSize), 0, maxCol),
        row: clamp(Math.floor((y - options.minY) / options.cellSize), 0, maxRow)
    };
};

const toWorldPoint = (cell: GridCell, options: GridPathfinderOptions): Vector2 => {
    const centerX = options.minX + (cell.col * options.cellSize) + (options.cellSize / 2);
    const centerY = options.minY + (cell.row * options.cellSize) + (options.cellSize / 2);
    return new Vector2(centerX, centerY);
};

const heuristic = (from: GridCell, to: GridCell): number => {
    const deltaCol = Math.abs(from.col - to.col);
    const deltaRow = Math.abs(from.row - to.row);
    const diagonalSteps = Math.min(deltaCol, deltaRow);
    const straightSteps = Math.max(deltaCol, deltaRow) - diagonalSteps;
    return (diagonalSteps * diagonalMoveCost) + (straightSteps * straightMoveCost);
};

const getGridExtents = (options: GridPathfinderOptions): { maxCol: number; maxRow: number } => {
    const usableWidth = Math.max(options.cellSize, options.maxX - options.minX);
    const usableHeight = Math.max(options.cellSize, options.maxY - options.minY);
    return {
        maxCol: Math.max(0, Math.ceil(usableWidth / options.cellSize) - 1),
        maxRow: Math.max(0, Math.ceil(usableHeight / options.cellSize) - 1)
    };
};

const isWithinGrid = (cell: GridCell, options: GridPathfinderOptions): boolean => {
    const extents = getGridExtents(options);
    return cell.col >= 0 && cell.col <= extents.maxCol && cell.row >= 0 && cell.row <= extents.maxRow;
};

const isCellBlocked = (cell: GridCell, options: GridPathfinderOptions): boolean => {
    if (!isWithinGrid(cell, options)) {
        return true;
    }

    const point = toWorldPoint(cell, options);
    return point.x < options.minX
        || point.x > options.maxX
        || point.y < options.minY
        || point.y > options.maxY
        || options.isBlocked(point.x, point.y);
};

const canTraverseDiagonal = (from: GridCell, direction: GridDirection, options: GridPathfinderOptions): boolean => {
    if (direction.col === 0 || direction.row === 0) {
        return true;
    }

    const horizontalNeighbor = { col: from.col + direction.col, row: from.row };
    const verticalNeighbor = { col: from.col, row: from.row + direction.row };
    return !isCellBlocked(horizontalNeighbor, options) && !isCellBlocked(verticalNeighbor, options);
};

const expandDiagonalSteps = (cells: GridCell[], options: GridPathfinderOptions): GridCell[] => {
    if (cells.length <= 1) {
        return cells;
    }

    const expanded: GridCell[] = [cells[0]];
    for (let i = 1; i < cells.length; ++i) {
        const previous = expanded[expanded.length - 1];
        const current = cells[i];
        const deltaCol = current.col - previous.col;
        const deltaRow = current.row - previous.row;
        if (Math.abs(deltaCol) === 1 && Math.abs(deltaRow) === 1) {
            const horizontalFirst = { col: previous.col + deltaCol, row: previous.row };
            const verticalFirst = { col: previous.col, row: previous.row + deltaRow };
            if (!isCellBlocked(horizontalFirst, options)) {
                expanded.push(horizontalFirst);
            } else if (!isCellBlocked(verticalFirst, options)) {
                expanded.push(verticalFirst);
            }
        }
        expanded.push(current);
    }

    return expanded;
};

const reconstructPath = (
    cameFrom: Map<string, string>,
    currentKey: string,
    options: GridPathfinderOptions,
    goal: { x: number; y: number }
): Vector2[] => {
    const cells: GridCell[] = [];
    let key: string | undefined = currentKey;
    while (key) {
        const [colText, rowText] = key.split(",");
        cells.push({ col: Number(colText), row: Number(rowText) });
        key = cameFrom.get(key);
    }

    cells.reverse();
    const expandedCells = expandDiagonalSteps(cells, options);
    const waypoints: Vector2[] = [];
    let previousDirection = "";
    for (let i = 1; i < expandedCells.length; ++i) {
        const previous = expandedCells[i - 1];
        const current = expandedCells[i];
        const direction = `${current.col - previous.col},${current.row - previous.row}`;
        const point = toWorldPoint(current, options);
        if (direction !== previousDirection || i === expandedCells.length - 1) {
            waypoints.push(point);
            previousDirection = direction;
        } else {
            waypoints[waypoints.length - 1] = point;
        }
    }

    if (!options.isBlocked(goal.x, goal.y)) {
        waypoints.push(new Vector2(goal.x, goal.y));
    }
    return waypoints;
};

export const findGridPath = (options: GridPathfinderOptions): Vector2[] | null => {
    if (options.cellSize <= 0) {
        return null;
    }

    const startCell = toGridCell(options.start.x, options.start.y, options);
    const goalCell = toGridCell(options.goal.x, options.goal.y, options);
    if (isCellBlocked(startCell, options) || isCellBlocked(goalCell, options)) {
        return null;
    }

    const startKey = buildCellKey(startCell.col, startCell.row);
    const goalKey = buildCellKey(goalCell.col, goalCell.row);
    const openNodes: OpenNode[] = [{
        ...startCell,
        key: startKey,
        gScore: 0,
        fScore: heuristic(startCell, goalCell)
    }];
    const cameFrom = new Map<string, string>();
    const gScores = new Map<string, number>([[startKey, 0]]);
    const closed = new Set<string>();

    while (openNodes.length > 0) {
        openNodes.sort((left, right) => left.fScore - right.fScore);
        const current = openNodes.shift()!;
        if (closed.has(current.key)) {
            continue;
        }
        if (current.key === goalKey) {
            return reconstructPath(cameFrom, current.key, options, options.goal);
        }

        closed.add(current.key);

        directions.forEach(direction => {
            const nextCol = current.col + direction.col;
            const nextRow = current.row + direction.row;
            const nextKey = buildCellKey(nextCol, nextRow);
            if (closed.has(nextKey)) {
                return;
            }

            if (!canTraverseDiagonal(current, direction, options)) {
                return;
            }

            const nextCell = { col: nextCol, row: nextRow };
            if (isCellBlocked(nextCell, options)) {
                return;
            }

            const tentativeGScore = (gScores.get(current.key) ?? Number.POSITIVE_INFINITY) + direction.cost;
            if (tentativeGScore >= (gScores.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
                return;
            }

            cameFrom.set(nextKey, current.key);
            gScores.set(nextKey, tentativeGScore);
            openNodes.push({
                col: nextCol,
                row: nextRow,
                key: nextKey,
                gScore: tentativeGScore,
                fScore: tentativeGScore + heuristic(nextCell, goalCell)
            });
        });
    }

    return null;
};