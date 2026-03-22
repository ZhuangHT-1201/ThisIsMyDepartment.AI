import { ThisIsMyDepartmentApp } from "../ThisIsMyDepartmentApp";
import { Scene } from "../../engine/scene/Scene";
import { asset } from "../../engine/assets/Assets";
import { GameScene } from "./GameScene";
import { FadeToBlackTransition } from "../../engine/transitions/FadeToBlackTransition";
import { FadeTransition } from "../../engine/transitions/FadeTransition";
import { Sound } from "../../engine/assets/Sound";
import { AsepriteNode } from "../../engine/scene/AsepriteNode";
import { SceneNode } from "../../engine/scene/SceneNode";
import { Direction } from "../../engine/geom/Direction";
import { PostCharacterTags } from "../nodes/CharacterNode";
import { TextNode } from "../../engine/scene/TextNode";
import { TextInputNode } from "../nodes/TextInputNode";
import { saveAvatarProfile } from "../services/profile";
import { isDev } from "../../engine/util/env";

export class TitleScene extends Scene<ThisIsMyDepartmentApp> {
    @asset("sounds/interface/click.mp3")
    private static confirmSound: Sound;

    private characterNodes: Array<AsepriteNode<ThisIsMyDepartmentApp>> =
        ThisIsMyDepartmentApp.characterSprites.map(aseprite => new AsepriteNode<ThisIsMyDepartmentApp>({ aseprite, tag: PostCharacterTags.IDLE, anchor: Direction.RIGHT }));
    private chooseNode = new TextNode<ThisIsMyDepartmentApp>({ font: ThisIsMyDepartmentApp.headlineFont, text: "CHOOSE AVATAR" });
    private confirmNode = new TextNode<ThisIsMyDepartmentApp>({ font: ThisIsMyDepartmentApp.standardFont, text: "⤶ CONTINUE", color: "white" });
    private containerNode = new SceneNode<ThisIsMyDepartmentApp>();
    private nameInputNode = new TextInputNode<ThisIsMyDepartmentApp>("", "SIGNED IN USER", 24);
    private index = 1;
    private hasStarted = false;

    public setup(): void {
        this.inTransition = new FadeTransition();
        this.outTransition = new FadeToBlackTransition({ duration: 0.5, exclusive: true });
        this.characterNodes.forEach(node => {
            this.containerNode.appendChild(node);
        });
        this.updatePositions();
        this.rootNode.setChildAnchor(Direction.CENTER);
        this.rootNode.appendChild(this.containerNode);
        this.rootNode.appendChild(this.chooseNode);
        this.chooseNode.moveBy(0, -60);
        this.rootNode.appendChild(this.confirmNode);
        this.rootNode.appendChild(this.nameInputNode);
        this.nameInputNode.onTextSubmit.connect(this.handleNameSubmitted, this);
        this.nameInputNode.moveBy(0, 60);
        this.confirmNode.moveBy(0, 90);
        this.moveLeft();
        this.nameInputNode.setText(this.game.userName);
        if (isDev() && !this.game.userName) {
            const name = Math.random() + "";
            this.nameInputNode.setText(name);
        }
    }
    private moveLeft(): void {
        this.characterNodes[this.index]?.scaleBy(1);
        this.index = (this.index + this.characterNodes.length - 1) % this.characterNodes.length;
        this.characterNodes[this.index]?.scaleBy(2);
        this.updatePositions();

    }
    private moveRight(): void {
        this.characterNodes[this.index]?.scaleBy(1);
        this.index = (this.index + 1) % this.characterNodes.length;
        this.characterNodes[this.index]?.scaleBy(2);
        this.updatePositions();
    }
    private async goToGame(): Promise<void> {
        TitleScene.confirmSound.play();
        await this.startGame();
    }

    private updatePositions(): void {
        let posX = - ThisIsMyDepartmentApp.characterSprites[0].width - 10;
        this.characterNodes.forEach(node => {
            posX += node.width + 10;
            node.moveTo(posX, 0);
        });
        this.containerNode.moveTo(-this.index * (ThisIsMyDepartmentApp.characterSprites[0].width + 10), 0);
    }

    public cleanup(): void {
        this.rootNode.clear();
    }

    public async startGame(): Promise<void> {
        const result = await saveAvatarProfile(this.index);
        if (result) {
            this.game.setCurrentUserProfile(result.profile);
        }
        this.game.markAvatarOnboardingComplete(this.index);
        this.game.scenes.setScene(GameScene as any);
    }

    public activate(): void {
        this.game.keyboard.onKeyDown.connect(this.handleButtonPress, this);
    }

    private async handleButtonPress(ev: KeyboardEvent): Promise<void> {
        if (ev.key === "ArrowLeft" || ev.key === "a") {
            this.moveLeft();
        } else if (ev.key === "ArrowRight" || ev.key === "d") {
            this.moveRight();
        } else if (ev.key === "Enter" || ev.key === " ") {
            this.tryStartGame();
        } else if (ev.key === "s" || ev.key === "ArrowDown") {
            this.nameInputNode.focus();
        }
    }

    private tryStartGame(): void {
        if (this.hasStarted) {
            return;
        }
        this.hasStarted = true;
        void this.goToGame();
    }

    private handleNameSubmitted(name: string): void {
        this.nameInputNode.setText(this.game.userName || name);
        this.tryStartGame();
    }

    public deactivate(): void {
        this.nameInputNode.onTextSubmit.disconnect(this.handleNameSubmitted, this);
        this.game.keyboard.onKeyDown.disconnect(this.handleButtonPress, this);
    }
}
