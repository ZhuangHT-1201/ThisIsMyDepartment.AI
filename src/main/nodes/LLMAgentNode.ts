import { CharacterNode } from "./CharacterNode";
import { NpcNode, NpcNodeArgs } from "./NpcNode";
import { LLMAgentService, LLMChatMessage, LLMChatResponse } from "../services/LLMAgentService";
import { SimpleDirection } from "../../engine/geom/Direction";
import { Vector2 } from "../../engine/graphics/Vector2";
import { TiledMapNode } from "../../engine/scene/TiledMapNode";
import { findGridPath } from "../navigation/GridPathfinder";

export interface LLMAgentNodeArgs extends NpcNodeArgs {
    agentId: string;
    displayName?: string;
    caption?: string;
    systemPrompt?: string;
    walkArea?: { x: number; y: number; width: number; height: number };
}

interface ConversationCache {
    history: LLMChatMessage[];
}

export class LLMAgentNode extends NpcNode {
    private static readonly collisionStuckThreshold = 0.18;
    private static readonly detourStep = 28;
    private static readonly detourForward = 52;
    private static readonly maxRandomPointAttempts = 12;
    private static readonly navigationCellSizeFallback = 32;
    private static readonly navigationCellSubdivision = 2;
    private static readonly minimumWaypointArrivalDistance = 6;

    private readonly agentId: string;
    private readonly displayName: string;
    private readonly defaultSystemPrompt?: string;
    private currentSystemPrompt?: string;
    private readonly defaultCaption: string;
    private wanderArea?: { minX: number; maxX: number; minY: number; maxY: number };
    private summonTarget?: Vector2;
    private currentTarget?: Vector2;
    private pathWaypoints: Vector2[] = [];
    private detourWaypoints: Vector2[] = [];
    private pathSearchFailureSignature: string | null = null;
    private idleTimer = 0;
    private pauseDuration = 0;

    private conversations = new Map<string, ConversationCache>();

    public constructor(args: LLMAgentNodeArgs) {
        super(args);
        this.agentId = args.agentId;
        this.displayName = args.displayName ?? args.id ?? args.agentId;
        this.defaultSystemPrompt = args.systemPrompt;
        this.currentSystemPrompt = args.systemPrompt;
        this.defaultCaption = args.caption ?? "按E键进行互动";
        this.setCaption(this.defaultCaption);
        this.setInteractionActionLabel("Chat with");
        this.setInteractionLabel(this.displayName);
        this.setNameLabel(this.displayName);
        if (args.walkArea) {
            this.wanderArea = {
                minX: args.walkArea.x,
                maxX: args.walkArea.x + args.walkArea.width,
                minY: args.walkArea.y,
                maxY: args.walkArea.y + args.walkArea.height
            };
            this.pauseDuration = this.randomPause();
        }
    }

    public update(dt: number, time: number): void {
        this.updateWanderIntent(dt);
        super.update(dt, time);
        this.enforceWanderBounds();
    }

    public setNavigation(args: {
        summonTarget?: { x: number; y: number };
        walkArea?: { x: number; y: number; width: number; height: number };
    }): void {
        this.summonTarget = args.summonTarget ? new Vector2(args.summonTarget.x, args.summonTarget.y) : undefined;
        this.currentTarget = undefined;
        this.pathWaypoints = [];
        this.detourWaypoints = [];
        this.pathSearchFailureSignature = null;
        this.idleTimer = 0;
        this.pauseDuration = this.randomPause();
        if (args.walkArea) {
            this.wanderArea = {
                minX: args.walkArea.x,
                maxX: args.walkArea.x + args.walkArea.width,
                minY: args.walkArea.y,
                maxY: args.walkArea.y + args.walkArea.height
            };
        }
    }

    private updateWanderIntent(dt: number): void {
        if (this.inConversation) {
            this.currentTarget = undefined;
            this.pathWaypoints = [];
            this.detourWaypoints = [];
            this.pathSearchFailureSignature = null;
            this.idleTimer = 0;
            this.pauseDuration = this.randomPause();
            this.setDirection(SimpleDirection.NONE);
            return;
        }

        if (!this.summonTarget && this.wanderArea && !this.currentTarget) {
            this.idleTimer += dt;
            this.setDirection(SimpleDirection.NONE);
            if (this.idleTimer >= this.pauseDuration) {
                this.currentTarget = this.pickRandomPoint();
                this.pathWaypoints = [];
                this.detourWaypoints = [];
                this.pathSearchFailureSignature = null;
                this.idleTimer = 0;
            }
        }

        const finalTarget = this.getFinalNavigationTarget();
        if (!finalTarget) {
            this.setDirection(SimpleDirection.NONE);
            return;
        }

        this.ensurePathToTarget(finalTarget);

        const activeTarget = this.getActiveTarget();
        if (activeTarget) {
            const current = new Vector2(this.getX(), this.getY());
            const deltaX = activeTarget.x - current.x;
            const deltaY = activeTarget.y - current.y;
            const distance = Math.hypot(deltaX, deltaY);
            if (distance <= this.getWaypointArrivalDistance()) {
                this.advanceTargetQueue();
                this.idleTimer = 0;
                this.pauseDuration = this.randomPause();
                this.setDirection(SimpleDirection.NONE);
                return;
            }

            if (this.tryResolveStuck(finalTarget, activeTarget, deltaX, deltaY)) {
                return;
            }

            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                this.setDirection(deltaX > 0 ? SimpleDirection.RIGHT : SimpleDirection.LEFT);
            } else {
                this.setDirection(deltaY > 0 ? SimpleDirection.BOTTOM : SimpleDirection.TOP);
            }
            return;
        }

        this.setDirection(SimpleDirection.NONE);
    }

    private pickRandomPoint(): Vector2 {
        for (let i = 0; i < LLMAgentNode.maxRandomPointAttempts; ++i) {
            const x = this.wanderArea!.minX + Math.random() * (this.wanderArea!.maxX - this.wanderArea!.minX);
            const y = this.wanderArea!.minY + Math.random() * (this.wanderArea!.maxY - this.wanderArea!.minY);
            const point = this.clampPointToBounds(new Vector2(x, y));
            if (this.canOccupyPosition(point.x, point.y)) {
                return point;
            }
        }

        return this.clampPointToBounds(new Vector2(this.getX(), this.getY()));
    }

    private randomPause(): number {
        return 1.5 + Math.random() * 2.5;
    }

    private clampToBounds(value: number, min: number, max: number): number {
        if (value < min) {
            return min;
        }
        if (value > max) {
            return max;
        }
        return value;
    }

    private enforceWanderBounds(): void {
        if (this.summonTarget || !this.wanderArea) {
            return;
        }

        const clampedX = this.clampToBounds(this.getX(), this.wanderArea.minX, this.wanderArea.maxX);
        const clampedY = this.clampToBounds(this.getY(), this.wanderArea.minY, this.wanderArea.maxY);
        if (clampedX !== this.getX() || clampedY !== this.getY()) {
            this.moveTo(clampedX, clampedY);
        }

        const activeTarget = this.getActiveTarget();
        if (activeTarget) {
            const distance = Math.hypot(activeTarget.x - this.getX(), activeTarget.y - this.getY());
            if (distance <= this.getWaypointArrivalDistance()) {
                this.advanceTargetQueue();
                this.idleTimer = 0;
                this.pauseDuration = this.randomPause();
                this.setDirection(SimpleDirection.NONE);
            }
        }
    }

    private getFinalNavigationTarget(): Vector2 | undefined {
        return this.summonTarget ?? this.currentTarget;
    }

    private getWaypointArrivalDistance(): number {
        const cellSize = this.getNavigationBounds()?.cellSize ?? LLMAgentNode.navigationCellSizeFallback;
        return Math.max(LLMAgentNode.minimumWaypointArrivalDistance, cellSize * 0.4);
    }

    private getActiveTarget(): Vector2 | undefined {
        return this.pathWaypoints[0] ?? this.detourWaypoints[0] ?? this.getFinalNavigationTarget();
    }

    private advanceTargetQueue(): void {
        if (this.pathWaypoints.length > 0) {
            this.pathWaypoints.shift();
            return;
        }

        if (this.detourWaypoints.length > 0) {
            this.detourWaypoints.shift();
            return;
        }

        if (this.summonTarget) {
            this.summonTarget = undefined;
            this.pathSearchFailureSignature = null;
            return;
        }

        this.currentTarget = undefined;
        this.pathSearchFailureSignature = null;
    }

    private tryResolveStuck(finalTarget: Vector2, activeTarget: Vector2, deltaX: number, deltaY: number): boolean {
        const blockedHorizontally = this.consecutiveXCollisions >= LLMAgentNode.collisionStuckThreshold;
        const blockedVertically = this.consecutiveYCollisions >= LLMAgentNode.collisionStuckThreshold;
        if (!blockedHorizontally && !blockedVertically) {
            return false;
        }

        this.pathWaypoints = [];
        this.pathSearchFailureSignature = null;
        if (!this.hasDirectPathTo(finalTarget)) {
            const replannedPath = this.buildPathToTarget(finalTarget);
            if (replannedPath && replannedPath.length > 0) {
                this.pathWaypoints = replannedPath;
                this.detourWaypoints = [];
                this.consecutiveXCollisions = 0;
                this.consecutiveYCollisions = 0;
                this.setDirection(SimpleDirection.NONE);
                return true;
            }
        }

        const detour = this.buildDetourWaypoints(activeTarget, deltaX, deltaY, blockedHorizontally, blockedVertically);
        if (!detour) {
            if (!this.summonTarget) {
                this.currentTarget = this.pickRandomPoint();
            }
            this.detourWaypoints = [];
            this.setDirection(SimpleDirection.NONE);
            return true;
        }

        this.detourWaypoints = detour;
        this.consecutiveXCollisions = 0;
        this.consecutiveYCollisions = 0;
        this.setDirection(SimpleDirection.NONE);
        return true;
    }

    private buildDetourWaypoints(
        activeTarget: Vector2,
        deltaX: number,
        deltaY: number,
        blockedHorizontally: boolean,
        blockedVertically: boolean
    ): Vector2[] | null {
        const current = new Vector2(this.getX(), this.getY());
        const horizontalPriority = Math.abs(deltaX) >= Math.abs(deltaY);
        const offsets = [
            LLMAgentNode.detourStep,
            -LLMAgentNode.detourStep,
            LLMAgentNode.detourStep * 2,
            -LLMAgentNode.detourStep * 2
        ];

        if (horizontalPriority || blockedHorizontally) {
            const forward = Math.sign(deltaX || 1) * LLMAgentNode.detourForward;
            for (const offset of offsets) {
                const sidestep = this.clampPointToBounds(new Vector2(current.x, current.y + offset));
                const forwardPoint = this.clampPointToBounds(new Vector2(current.x + forward, current.y + offset));
                if (this.canOccupyPosition(sidestep.x, sidestep.y) && this.canOccupyPosition(forwardPoint.x, forwardPoint.y)) {
                    return [sidestep, forwardPoint];
                }
            }
        }

        if (!horizontalPriority || blockedVertically) {
            const forward = Math.sign(deltaY || 1) * LLMAgentNode.detourForward;
            for (const offset of offsets) {
                const sidestep = this.clampPointToBounds(new Vector2(current.x + offset, current.y));
                const forwardPoint = this.clampPointToBounds(new Vector2(current.x + offset, current.y + forward));
                if (this.canOccupyPosition(sidestep.x, sidestep.y) && this.canOccupyPosition(forwardPoint.x, forwardPoint.y)) {
                    return [sidestep, forwardPoint];
                }
            }
        }

        const finalTarget = this.clampPointToBounds(activeTarget.clone());
        return this.canOccupyPosition(finalTarget.x, finalTarget.y) ? [finalTarget] : null;
    }

    private clampPointToBounds(point: Vector2): Vector2 {
        if (!this.wanderArea) {
            return point;
        }

        point.x = this.clampToBounds(point.x, this.wanderArea.minX, this.wanderArea.maxX);
        point.y = this.clampToBounds(point.y, this.wanderArea.minY, this.wanderArea.maxY);
        return point;
    }

    private ensurePathToTarget(target: Vector2): void {
        if (this.detourWaypoints.length > 0 || this.pathWaypoints.length > 0) {
            return;
        }
        if (this.hasDirectPathTo(target)) {
            this.pathSearchFailureSignature = null;
            return;
        }

        const failureSignature = this.buildPathSignature(target);
        if (failureSignature && this.pathSearchFailureSignature === failureSignature) {
            return;
        }

        const path = this.buildPathToTarget(target);
        if (path && path.length > 0) {
            this.pathWaypoints = path;
            this.pathSearchFailureSignature = null;
            return;
        }

        this.pathSearchFailureSignature = failureSignature;
    }

    private buildPathToTarget(target: Vector2): Vector2[] | null {
        const navigationBounds = this.getNavigationBounds();
        if (!navigationBounds) {
            return null;
        }

        return findGridPath({
            start: { x: this.getX(), y: this.getY() },
            goal: { x: target.x, y: target.y },
            minX: navigationBounds.minX,
            minY: navigationBounds.minY,
            maxX: navigationBounds.maxX,
            maxY: navigationBounds.maxY,
            cellSize: navigationBounds.cellSize,
            isBlocked: (x, y) => this.hasLevelCollisionAt(x, y)
        });
    }

    private hasDirectPathTo(target: Vector2): boolean {
        const navigationBounds = this.getNavigationBounds();
        if (!navigationBounds) {
            return true;
        }

        const distance = Math.hypot(target.x - this.getX(), target.y - this.getY());
        if (distance <= navigationBounds.cellSize / 2) {
            return true;
        }

        const steps = Math.max(1, Math.ceil(distance / Math.max(8, navigationBounds.cellSize / 2)));
        for (let i = 1; i <= steps; ++i) {
            const ratio = i / steps;
            const x = this.getX() + ((target.x - this.getX()) * ratio);
            const y = this.getY() + ((target.y - this.getY()) * ratio);
            if (x < navigationBounds.minX || x > navigationBounds.maxX || y < navigationBounds.minY || y > navigationBounds.maxY) {
                return false;
            }
            if (this.hasLevelCollisionAt(x, y)) {
                return false;
            }
        }

        return true;
    }

    private getNavigationBounds(): { minX: number; minY: number; maxX: number; maxY: number; cellSize: number } | null {
        const scene = this.getScene();
        if (!scene) {
            return null;
        }

        const mapNode = scene.rootNode.getDescendantsByType<TiledMapNode<any>>(TiledMapNode)[0];
        const baseCellSize = Math.min(
            mapNode?.getTileWidth() ?? LLMAgentNode.navigationCellSizeFallback,
            mapNode?.getTileHeight() ?? LLMAgentNode.navigationCellSizeFallback
        );
        const cellSize = Math.max(8, Math.floor(baseCellSize / LLMAgentNode.navigationCellSubdivision));
        const halfCell = cellSize / 2;
        const worldMaxX = Math.max(cellSize, (mapNode?.width ?? scene.rootNode.width) - halfCell);
        const worldMaxY = Math.max(cellSize, (mapNode?.height ?? scene.rootNode.height) - halfCell);
        const worldMinX = halfCell;
        const worldMinY = halfCell;

        if (!this.summonTarget && this.wanderArea) {
            return {
                minX: Math.max(worldMinX, this.wanderArea.minX + halfCell),
                minY: Math.max(worldMinY, this.wanderArea.minY + halfCell),
                maxX: Math.min(worldMaxX, this.wanderArea.maxX - halfCell),
                maxY: Math.min(worldMaxY, this.wanderArea.maxY - halfCell),
                cellSize
            };
        }

        return {
            minX: worldMinX,
            minY: worldMinY,
            maxX: worldMaxX,
            maxY: worldMaxY,
            cellSize
        };
    }

    private buildPathSignature(target: Vector2): string | null {
        const bounds = this.getNavigationBounds();
        if (!bounds) {
            return null;
        }

        const startCol = Math.floor((this.getX() - bounds.minX) / bounds.cellSize);
        const startRow = Math.floor((this.getY() - bounds.minY) / bounds.cellSize);
        const goalCol = Math.floor((target.x - bounds.minX) / bounds.cellSize);
        const goalRow = Math.floor((target.y - bounds.minY) / bounds.cellSize);
        return `${startCol},${startRow}->${goalCol},${goalRow}`;
    }

    public interact(): void {
        if (this.canInteract()) {
            this.getGame().startLLMConversation(this);
        }
    }

    public getAgentId(): string {
        return this.agentId;
    }

    public getDisplayName(): string {
        return this.displayName;
    }

    public getSystemPrompt(): string {
        return this.currentSystemPrompt ?? "";
    }

    public setSystemPrompt(prompt?: string): void {
        const normalized = prompt?.trim();
        this.currentSystemPrompt = normalized && normalized.length > 0 ? normalized : undefined;
        this.conversations.clear();
    }

    public restoreDefaultSystemPrompt(): void {
        this.currentSystemPrompt = this.defaultSystemPrompt;
        this.conversations.clear();
    }

    public resetConversation(playerId: string): void {
        this.conversations.delete(playerId);
    }

    public isPlayerInRange(character: CharacterNode): boolean {
        const playerPos = character.getScenePosition();
        const agentPos = this.getScenePosition();
        const range = this.getRange();
        return playerPos.getSquareDistance(agentPos) <= range ** 2;
    }

    public async requestResponse(args: { playerId: string; playerName?: string; message: string; metadata?: Record<string, unknown>; }): Promise<LLMChatResponse> {
        const cache = this.getConversation(args.playerId);
        const history: LLMChatMessage[] = [
            ...cache.history,
            { role: "user" as const, content: args.message }
        ];
        const response = await LLMAgentService.instance.send({
            agentId: this.agentId,
            playerId: args.playerId,
            playerName: args.playerName,
            message: args.message,
            history,
            metadata: {
                agentDisplayName: this.displayName,
                ...args.metadata
            }
        });
        const reply = response.reply ?? "";
        if (response.history && response.history.length > 0) {
            this.conversations.set(args.playerId, { history: response.history });
        } else {
            const nextHistory = [...history];
            if (reply.trim()) {
                nextHistory.push({ role: "assistant" as const, content: reply });
            }
            this.conversations.set(args.playerId, { history: nextHistory });
        }
        return response;
    }

    public endConversation(playerId: string, resetHistory = false): void {
        this.inConversation = false;
        this.setCaption(this.defaultCaption);
        if (resetHistory) {
            this.resetConversation(playerId);
        }
    }

    private getConversation(playerId: string): ConversationCache {
        if (!this.conversations.has(playerId)) {
            const history: LLMChatMessage[] = [];
            if (this.currentSystemPrompt) {
                history.push({ role: "system" as const, content: this.currentSystemPrompt });
            }
            this.conversations.set(playerId, { history });
        }
        const cache = this.conversations.get(playerId)!;
        return { history: [...cache.history] };
    }
}
