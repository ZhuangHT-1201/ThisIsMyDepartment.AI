import { CharacterNode } from "./CharacterNode";
import { NpcNode, NpcNodeArgs } from "./NpcNode";
import { LLMAgentService, LLMChatMessage, LLMChatResponse } from "../services/LLMAgentService";
import { SimpleDirection } from "../../engine/geom/Direction";
import { Vector2 } from "../../engine/graphics/Vector2";

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
    private readonly agentId: string;
    private readonly displayName: string;
    private readonly systemPrompt?: string;
    private readonly defaultCaption: string;
    private readonly wanderArea?: { minX: number; maxX: number; minY: number; maxY: number };
    private currentTarget?: Vector2;
    private idleTimer = 0;
    private pauseDuration = 0;

    private conversations = new Map<string, ConversationCache>();

    public constructor(args: LLMAgentNodeArgs) {
        super(args);
        this.agentId = args.agentId;
        this.displayName = args.displayName ?? args.id ?? args.agentId;
        this.systemPrompt = args.systemPrompt;
        this.defaultCaption = args.caption ?? "按E键进行互动";
        this.setCaption(this.defaultCaption);
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

    private updateWanderIntent(dt: number): void {
        if (!this.wanderArea) {
            return;
        }
        if (this.inConversation) {
            this.currentTarget = undefined;
            this.idleTimer = 0;
            this.pauseDuration = this.randomPause();
            this.setDirection(SimpleDirection.NONE);
            return;
        }

        if (!this.currentTarget) {
            this.idleTimer += dt;
            this.setDirection(SimpleDirection.NONE);
            if (this.idleTimer >= this.pauseDuration) {
                this.currentTarget = this.pickRandomPoint();
                this.idleTimer = 0;
            }
            return;
        }

        const current = new Vector2(this.getX(), this.getY());
        const deltaX = this.currentTarget.x - current.x;
        const deltaY = this.currentTarget.y - current.y;
        const distance = Math.hypot(deltaX, deltaY);
        if (distance <= 4) {
            this.currentTarget = undefined;
            this.idleTimer = 0;
            this.pauseDuration = this.randomPause();
            this.setDirection(SimpleDirection.NONE);
            return;
        }

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            this.setDirection(deltaX > 0 ? SimpleDirection.RIGHT : SimpleDirection.LEFT);
        } else {
            this.setDirection(deltaY > 0 ? SimpleDirection.BOTTOM : SimpleDirection.TOP);
        }
    }

    private pickRandomPoint(): Vector2 {
        const x = this.wanderArea!.minX + Math.random() * (this.wanderArea!.maxX - this.wanderArea!.minX);
        const y = this.wanderArea!.minY + Math.random() * (this.wanderArea!.maxY - this.wanderArea!.minY);
        return new Vector2(x, y);
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
        if (!this.wanderArea) {
            return;
        }

        const clampedX = this.clampToBounds(this.getX(), this.wanderArea.minX, this.wanderArea.maxX);
        const clampedY = this.clampToBounds(this.getY(), this.wanderArea.minY, this.wanderArea.maxY);
        if (clampedX !== this.getX() || clampedY !== this.getY()) {
            this.moveTo(clampedX, clampedY);
        }

        if (this.currentTarget) {
            const distance = Math.hypot(this.currentTarget.x - this.getX(), this.currentTarget.y - this.getY());
            if (distance <= 4) {
                this.currentTarget = undefined;
                this.idleTimer = 0;
                this.pauseDuration = this.randomPause();
                this.setDirection(SimpleDirection.NONE);
            }
        }
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
            if (this.systemPrompt) {
                history.push({ role: "system" as const, content: this.systemPrompt });
            }
            this.conversations.set(playerId, { history });
        }
        const cache = this.conversations.get(playerId)!;
        return { history: [...cache.history] };
    }
}
