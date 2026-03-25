import { ThisIsMyDepartmentApp } from "../ThisIsMyDepartmentApp";
import { ActivitySummary, fetchActivitySummary } from "../services/activity";
import { getUiFontStack } from "../i18n";

export class CharacterStatusOverlay {
    private static readonly PANEL_TEXT = "#eef3ff";
    private static readonly MUTED_TEXT = "#c3d1f3";
    private static readonly LABEL_TEXT = "#8fb4f5";
    private static readonly BORDER_COLOR = "rgba(164, 190, 255, 0.28)";
    private static readonly PANEL_BACKGROUND = "linear-gradient(160deg, rgba(22, 29, 44, 0.98), rgba(11, 16, 26, 0.98))";
    private static readonly PANEL_BACKGROUND_HOVER = "linear-gradient(180deg, rgba(60, 88, 144, 0.98), rgba(24, 41, 73, 0.98))";
    private static readonly BUTTON_BACKGROUND = "linear-gradient(180deg, rgba(44, 63, 102, 0.96), rgba(20, 31, 54, 0.96))";
    private static readonly BUTTON_BACKGROUND_ACTIVE = "linear-gradient(180deg, rgba(72, 126, 255, 0.38), rgba(35, 86, 204, 0.28))";
    private static readonly BUTTON_BACKGROUND_INACTIVE = "linear-gradient(180deg, rgba(56, 66, 92, 0.94), rgba(28, 34, 50, 0.96))";

    private root?: HTMLDivElement;
    private collapseButton?: HTMLButtonElement;
    private previewCanvas?: HTMLCanvasElement;
    private nameValue?: HTMLDivElement;
    private playerChatsValue?: HTMLDivElement;
    private agentChatsValue?: HTMLDivElement;
    private appUsageValue?: HTMLDivElement;
    private roleValue?: HTMLDivElement;
    private affiliationValue?: HTMLDivElement;
    private userIdValue?: HTMLDivElement;
    private statusValue?: HTMLDivElement;
    private audioToggleButton?: HTMLButtonElement;
    private videoToggleButton?: HTMLButtonElement;
    private app?: ThisIsMyDepartmentApp;
    private collapsed = false;
    private lastSnapshotKey = "";
    private statsUserId = "";
    private statsActivityVersion = -1;
    private statsFetchPromise?: Promise<void>;
    private statsSummary: ActivitySummary = {
        playerChats: 0,
        agentChats: 0,
        appUsageMinutes: 0
    };

    public open(app: ThisIsMyDepartmentApp): void {
        this.app = app;
        if (!this.root) {
            this.root = this.createRoot();
            document.body.appendChild(this.root);
        }
        this.root.hidden = false;
        this.applyCollapsedState();
        this.refresh();
        this.maybeRefreshStats(true);
    }

    public close(): void {
        this.root?.remove();
        this.root = undefined;
        this.collapseButton = undefined;
        this.previewCanvas = undefined;
        this.nameValue = undefined;
        this.playerChatsValue = undefined;
        this.agentChatsValue = undefined;
        this.appUsageValue = undefined;
        this.roleValue = undefined;
        this.affiliationValue = undefined;
        this.userIdValue = undefined;
        this.statusValue = undefined;
        this.audioToggleButton = undefined;
        this.videoToggleButton = undefined;
        this.app = undefined;
        this.lastSnapshotKey = "";
        this.statsUserId = "";
        this.statsActivityVersion = -1;
        this.statsFetchPromise = undefined;
        document.documentElement.style.removeProperty("--timd-character-status-height");
        this.statsSummary = {
            playerChats: 0,
            agentChats: 0,
            appUsageMinutes: 0
        };
    }

    public refresh(): void {
        if (!this.root || !this.app) {
            return;
        }

        const app = this.app;
        const currentUser = this.app.getCurrentUser();
        const profile = this.app.getCurrentUserProfile();
        const spriteIndex = profile?.avatar?.spriteIndex ?? this.app.initialPlayerSprite ?? 0;
        const roles = currentUser?.roles?.filter(Boolean) ?? [];
        const status = this.buildStatusSummary();
        const affiliation = [currentUser?.organization, currentUser?.department].filter(Boolean).join(" / ") || app.t("status.defaultAffiliation");
        const roleText = roles.length > 0 ? roles.join(", ") : app.t("status.defaultRole");

        const snapshotKey = JSON.stringify({
            name: currentUser?.displayName ?? this.app.userName,
            roleText,
            affiliation,
            userId: currentUser?.userId ?? this.app.userId,
            status,
            spriteIndex,
            promptConfigured: !!profile?.characterSystemPrompt?.trim(),
            hasAvatar: !!profile?.avatar,
            connected: this.app.onlineService?.isConnected() ?? false,
            audioEnabled: this.app.isLocalAudioEnabled(),
            videoEnabled: this.app.isLocalVideoEnabled()
        });

        if (snapshotKey !== this.lastSnapshotKey) {
            this.lastSnapshotKey = snapshotKey;
            if (this.nameValue) {
                this.nameValue.textContent = currentUser?.displayName ?? this.app.userName ?? app.t("status.guest");
            }
            if (this.roleValue) {
                this.roleValue.textContent = roleText;
            }
            if (this.affiliationValue) {
                this.affiliationValue.textContent = affiliation;
            }
            if (this.userIdValue) {
                this.userIdValue.textContent = currentUser?.userId ?? this.app.userId;
            }
            if (this.statusValue) {
                this.statusValue.textContent = status;
            }
            this.updateMediaButtons();
        }

        this.drawSpritePreview(spriteIndex);
        this.maybeRefreshStats();
        this.syncLayoutMetrics();
    }

    private createRoot(): HTMLDivElement {
        const app = this.app!;
        const root = document.createElement("div");
        root.className = "timd-character-status";
        root.style.position = "fixed";
        root.style.top = "16px";
        root.style.left = "16px";
        root.style.zIndex = "9998";
        root.style.pointerEvents = "auto";
        root.style.width = "312px";
        root.style.color = CharacterStatusOverlay.PANEL_TEXT;
        root.style.fontFamily = getUiFontStack(app.getLanguage());

        const panel = document.createElement("div");
    panel.className = "timd-character-status__panel";
        panel.style.position = "relative";
        panel.style.padding = "10px";
        panel.style.border = `1px solid ${CharacterStatusOverlay.BORDER_COLOR}`;
        panel.style.background = CharacterStatusOverlay.PANEL_BACKGROUND;
        panel.style.boxShadow = "0 22px 56px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
        panel.style.clipPath = "polygon(0 10px, 10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px))";

        const trim = document.createElement("div");
        trim.style.position = "absolute";
        trim.style.top = "5px";
        trim.style.right = "5px";
        trim.style.bottom = "5px";
        trim.style.left = "5px";
        trim.style.pointerEvents = "none";
        trim.style.border = "1px solid rgba(164, 190, 255, 0.12)";
        trim.style.clipPath = "polygon(0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px))";

        const collapseButton = this.createCollapseButton();
        this.collapseButton = collapseButton;

        const header = document.createElement("div");
        header.style.display = "grid";
        header.style.gridTemplateColumns = "76px minmax(0, 1fr)";
        header.style.gap = "8px";
        header.style.alignItems = "start";

        const previewFrame = document.createElement("div");
        previewFrame.style.padding = "4px";
        previewFrame.style.border = "1px solid rgba(164, 190, 255, 0.22)";
        previewFrame.style.background = "linear-gradient(180deg, rgba(38, 49, 78, 0.96), rgba(18, 24, 41, 0.96))";
        previewFrame.style.boxShadow = "inset 0 0 0 1px rgba(255,255,255,0.06)";

        const previewCanvas = document.createElement("canvas");
        previewCanvas.width = 64;
        previewCanvas.height = 64;
        previewCanvas.style.width = "64px";
        previewCanvas.style.height = "64px";
        previewCanvas.style.display = "block";
        previewCanvas.style.imageRendering = "pixelated";
        previewCanvas.style.background = "radial-gradient(circle at 50% 36%, rgba(110, 170, 255, 0.22), rgba(10, 14, 26, 0.88) 72%)";
        this.previewCanvas = previewCanvas;
        previewFrame.appendChild(previewCanvas);

        const identity = document.createElement("div");
        identity.style.display = "grid";
        identity.style.gridTemplateColumns = "1fr";
        identity.style.gap = "5px";
        identity.style.minWidth = "0";

        const nameValue = document.createElement("div");
        nameValue.style.minWidth = "0";
        nameValue.style.fontSize = "15px";
        nameValue.style.lineHeight = "1";
        nameValue.style.fontWeight = "700";
        nameValue.style.color = CharacterStatusOverlay.PANEL_TEXT;
        this.nameValue = nameValue;

        const statusBadge = document.createElement("div");
        statusBadge.style.display = "inline-flex";
        statusBadge.style.alignItems = "center";
        statusBadge.style.justifyContent = "flex-start";
        statusBadge.style.width = "fit-content";
        statusBadge.style.padding = "3px 7px";
        statusBadge.style.border = "1px solid rgba(122, 170, 255, 0.26)";
        statusBadge.style.background = "rgba(72, 126, 255, 0.16)";
        statusBadge.style.fontSize = "9px";
        statusBadge.style.lineHeight = "1.1";
        statusBadge.style.letterSpacing = "0.1em";
        statusBadge.style.color = "#cfe0ff";
        statusBadge.style.textTransform = "uppercase";
        statusBadge.style.flexShrink = "0";
        statusBadge.style.alignSelf = "start";
        this.statusValue = statusBadge;

        identity.appendChild(nameValue);
        identity.appendChild(statusBadge);

        const mediaButtons = document.createElement("div");
        mediaButtons.style.display = "grid";
        mediaButtons.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
        mediaButtons.style.gap = "6px";
        mediaButtons.style.marginTop = "2px";
        this.audioToggleButton = this.createMediaButton(app.t("status.audio.off"), () => {
            this.app?.toggleLocalAudio();
            this.refresh();
        });
        this.videoToggleButton = this.createMediaButton(app.t("status.video.off"), () => {
            this.app?.toggleLocalVideo();
            this.refresh();
        });
        mediaButtons.appendChild(this.audioToggleButton);
        mediaButtons.appendChild(this.videoToggleButton);
        identity.appendChild(mediaButtons);

        const statsGrid = document.createElement("div");
        statsGrid.style.display = "grid";
        statsGrid.style.gridTemplateColumns = "1fr";
        statsGrid.style.gap = "3px";
        statsGrid.style.marginTop = "2px";
        statsGrid.style.minWidth = "0";

        this.playerChatsValue = this.createStatRow(statsGrid, app.t("status.chatsUsers"), "0");
        this.agentChatsValue = this.createStatRow(statsGrid, app.t("status.chatsAi"), "0");
        this.appUsageValue = this.createStatRow(statsGrid, app.t("status.appUsage"), "0");

        identity.appendChild(statsGrid);

        const metaGrid = document.createElement("div");
        metaGrid.style.display = "grid";
        metaGrid.style.gridTemplateColumns = "1fr";
        metaGrid.style.gap = "5px";
        metaGrid.style.minWidth = "0";
        metaGrid.style.marginTop = "10px";

        this.roleValue = this.createMetaRow(metaGrid, app.t("status.role"), app.t("status.defaultRole"));
        this.affiliationValue = this.createMetaRow(metaGrid, app.t("status.affiliation"), app.t("status.defaultAffiliation"));
        this.userIdValue = this.createMetaRow(metaGrid, app.t("status.userId"), "unknown-user");

        header.appendChild(previewFrame);
        header.appendChild(identity);

        const actions = document.createElement("div");
        actions.style.display = "grid";
        actions.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
        actions.style.gap = "8px";
        actions.style.marginTop = "10px";

        actions.appendChild(this.createActionButton(app.t("status.action.character"), () => this.app?.openSettingsOverlay("character")));
        actions.appendChild(this.createActionButton(app.t("status.action.settings"), () => this.app?.openSettingsOverlay("media"), true));

        panel.appendChild(trim);
        panel.appendChild(collapseButton);
        panel.appendChild(header);
        panel.appendChild(metaGrid);
        panel.appendChild(actions);
        root.appendChild(panel);
        return root;
    }

    private createCollapseButton(): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "timd-sidebar-toggle timd-sidebar-toggle--character";
        button.onclick = () => {
            this.collapsed = !this.collapsed;
            this.applyCollapsedState();
            this.syncLayoutMetrics();
        };
        return button;
    }

    private applyCollapsedState(): void {
        if (!this.root) {
            return;
        }

        this.root.classList.toggle("timd-character-status--collapsed", this.collapsed);
        if (this.collapseButton) {
            this.collapseButton.textContent = this.collapsed ? "›" : "‹";
            this.collapseButton.title = this.collapsed ? "Expand character panel" : "Collapse character panel";
            this.collapseButton.setAttribute("aria-label", this.collapseButton.title);
        }
    }

    private syncLayoutMetrics(): void {
        if (!this.root) {
            return;
        }

        requestAnimationFrame(() => {
            if (!this.root) {
                return;
            }
            document.documentElement.style.setProperty("--timd-character-status-height", `${this.root.offsetHeight}px`);
        });
    }

    private createMetaRow(parent: HTMLElement, label: string, initialValue: string): HTMLDivElement {
        const row = document.createElement("div");
        row.style.display = "grid";
        row.style.gridTemplateColumns = "94px minmax(0, 1fr)";
        row.style.gap = "6px";
        row.style.alignItems = "start";
        row.style.minWidth = "0";

        const labelNode = document.createElement("div");
        labelNode.textContent = label;
        labelNode.style.fontSize = "10px";
        labelNode.style.letterSpacing = "0.14em";
        labelNode.style.color = CharacterStatusOverlay.LABEL_TEXT;
        labelNode.style.textTransform = "uppercase";

        const valueNode = document.createElement("div");
        valueNode.textContent = initialValue;
        valueNode.style.minWidth = "0";
        valueNode.style.fontSize = "12px";
        valueNode.style.lineHeight = "1.3";
        valueNode.style.color = CharacterStatusOverlay.PANEL_TEXT;
        valueNode.style.wordBreak = "break-word";

        row.appendChild(labelNode);
        row.appendChild(valueNode);
        parent.appendChild(row);
        return valueNode;
    }

    private createStatRow(parent: HTMLElement, label: string, initialValue: string): HTMLDivElement {
        const row = document.createElement("div");
        row.style.display = "grid";
        row.style.gridTemplateColumns = "minmax(0, 1fr) auto";
        row.style.columnGap = "8px";
        row.style.alignItems = "baseline";
        row.style.minWidth = "0";

        const labelNode = document.createElement("div");
        labelNode.textContent = label;
        labelNode.style.minWidth = "0";
        labelNode.style.fontSize = "10px";
        labelNode.style.lineHeight = "1.2";
        labelNode.style.color = CharacterStatusOverlay.MUTED_TEXT;

        const valueNode = document.createElement("div");
        valueNode.textContent = initialValue;
        valueNode.style.fontSize = "10px";
        valueNode.style.lineHeight = "1.2";
        valueNode.style.fontWeight = "700";
        valueNode.style.color = CharacterStatusOverlay.PANEL_TEXT;
        valueNode.style.whiteSpace = "nowrap";

        row.appendChild(labelNode);
        row.appendChild(valueNode);
        parent.appendChild(row);
        return valueNode;
    }

    private createActionButton(label: string, onClick: () => void, isGear = false): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.style.display = "flex";
        button.style.alignItems = "center";
        button.style.justifyContent = "center";
        button.style.gap = "8px";
        button.style.padding = "8px 10px";
        button.style.border = `1px solid ${CharacterStatusOverlay.BORDER_COLOR}`;
        button.style.background = CharacterStatusOverlay.BUTTON_BACKGROUND;
        button.style.color = CharacterStatusOverlay.PANEL_TEXT;
        button.style.cursor = "pointer";
        button.style.font = `600 12px ${getUiFontStack(this.app?.getLanguage() ?? "en")}`;
        button.style.textTransform = "uppercase";
        button.style.letterSpacing = "0.08em";
        button.onmouseenter = () => {
            button.style.background = CharacterStatusOverlay.PANEL_BACKGROUND_HOVER;
        };
        button.onmouseleave = () => {
            button.style.background = CharacterStatusOverlay.BUTTON_BACKGROUND;
        };
        button.onclick = onClick;

        if (isGear) {
            const icon = document.createElement("img");
            icon.src = "assets/images/settings.png";
            icon.alt = "Settings";
            icon.style.width = "14px";
            icon.style.height = "14px";
            icon.style.imageRendering = "pixelated";
            button.appendChild(icon);
        } else {
            const icon = document.createElement("span");
            icon.textContent = label.slice(0, 1);
            icon.style.display = "inline-flex";
            icon.style.width = "16px";
            icon.style.height = "16px";
            icon.style.alignItems = "center";
            icon.style.justifyContent = "center";
            icon.style.border = "1px solid rgba(164, 190, 255, 0.28)";
            icon.style.background = "rgba(72, 126, 255, 0.14)";
            icon.style.fontSize = "10px";
            icon.style.lineHeight = "1";
            button.appendChild(icon);
        }

        const labelNode = document.createElement("span");
        labelNode.textContent = label;
        button.appendChild(labelNode);
        return button;
    }

    private createMediaButton(label: string, onClick: () => void): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.style.padding = "5px 6px";
        button.style.border = `1px solid ${CharacterStatusOverlay.BORDER_COLOR}`;
        button.style.background = CharacterStatusOverlay.BUTTON_BACKGROUND_INACTIVE;
        button.style.color = CharacterStatusOverlay.PANEL_TEXT;
        button.style.cursor = "pointer";
        button.style.font = `600 10px ${getUiFontStack(this.app?.getLanguage() ?? "en")}`;
        button.style.textTransform = "uppercase";
        button.style.letterSpacing = "0.06em";
        button.onclick = onClick;
        return button;
    }

    private drawSpritePreview(spriteIndex: number): void {
        if (!this.previewCanvas) {
            return;
        }

        const sprite = ThisIsMyDepartmentApp.characterSprites[spriteIndex] ?? ThisIsMyDepartmentApp.characterSprites[0];
        const ctx = this.previewCanvas.getContext("2d");
        if (!ctx || !sprite) {
            return;
        }

        ctx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
        ctx.imageSmoothingEnabled = false;

        const scale = Math.max(1, Math.floor(Math.min(this.previewCanvas.width / sprite.width, this.previewCanvas.height / sprite.height) * 0.82));
        const drawWidth = sprite.width * scale;
        const drawHeight = sprite.height * scale;
        const offsetX = Math.floor((this.previewCanvas.width - drawWidth) / 2);
        const offsetY = Math.floor((this.previewCanvas.height - drawHeight) / 2);

        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);
        if (sprite.hasTag("idle")) {
            sprite.drawTag(ctx, "idle", 0, 0, performance.now());
        } else {
            sprite.draw(ctx, 0, 0, performance.now());
        }
        ctx.restore();
    }

    private buildStatusSummary(): string {
        if (!this.app) {
            return "";
        }
        if (this.app.onlineService?.isConnected()) {
            return this.app.t("status.roomReady");
        }
        if (this.app.JitsiInstance) {
            return this.app.t("status.joiningRoom");
        }
        return this.app.t("status.starting");
    }

    private updateMediaButtons(): void {
        if (!this.app) {
            return;
        }
        if (this.audioToggleButton) {
            const audioEnabled = this.app.isLocalAudioEnabled();
            this.audioToggleButton.textContent = audioEnabled ? this.app.t("status.audio.on") : this.app.t("status.audio.off");
            this.audioToggleButton.style.background = audioEnabled
                ? CharacterStatusOverlay.BUTTON_BACKGROUND_ACTIVE
                : CharacterStatusOverlay.BUTTON_BACKGROUND_INACTIVE;
            this.audioToggleButton.style.borderColor = audioEnabled
                ? "rgba(122, 170, 255, 0.38)"
                : CharacterStatusOverlay.BORDER_COLOR;
        }
        if (this.videoToggleButton) {
            const videoEnabled = this.app.isLocalVideoEnabled();
            this.videoToggleButton.textContent = videoEnabled ? this.app.t("status.video.on") : this.app.t("status.video.off");
            this.videoToggleButton.style.background = videoEnabled
                ? CharacterStatusOverlay.BUTTON_BACKGROUND_ACTIVE
                : CharacterStatusOverlay.BUTTON_BACKGROUND_INACTIVE;
            this.videoToggleButton.style.borderColor = videoEnabled
                ? "rgba(122, 170, 255, 0.38)"
                : CharacterStatusOverlay.BORDER_COLOR;
        }
    }

    private maybeRefreshStats(force = false): void {
        if (!this.app) {
            return;
        }

        const userId = this.app.getCurrentUser()?.userId ?? this.app.userId;
        const activityVersion = this.app.getActivityVersion();
        const shouldRefresh = force
            || userId !== this.statsUserId
            || activityVersion !== this.statsActivityVersion;

        if (!shouldRefresh || this.statsFetchPromise) {
            return;
        }

        this.statsUserId = userId;
        this.statsActivityVersion = activityVersion;
        this.statsFetchPromise = fetchActivitySummary()
            .then(summary => {
                this.statsSummary = summary;
                this.updateStatsDisplay();
            })
            .catch(error => {
                console.warn("Failed to refresh character status stats", error);
            })
            .finally(() => {
                this.statsFetchPromise = undefined;
            });
    }

    private updateStatsDisplay(): void {
        if (this.playerChatsValue) {
            this.playerChatsValue.textContent = String(this.statsSummary.playerChats);
        }
        if (this.agentChatsValue) {
            this.agentChatsValue.textContent = String(this.statsSummary.agentChats);
        }
        if (this.appUsageValue) {
            this.appUsageValue.textContent = this.formatUsageMinutes(this.statsSummary.appUsageMinutes);
        }
    }

    private formatUsageMinutes(minutes: number): string {
        if (minutes <= 0) {
            return "0";
        }
        if (minutes < 10) {
            return minutes.toFixed(1);
        }
        return String(Math.round(minutes));
    }
}