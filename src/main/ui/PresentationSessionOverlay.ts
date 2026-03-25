import { getUiFontStack } from "../i18n";
import type { PresentationAudienceMember, ThisIsMyDepartmentApp } from "../ThisIsMyDepartmentApp";

export class PresentationSessionOverlay {
    private root?: HTMLDivElement;
    private titleNode?: HTMLDivElement;
    private subtitleNode?: HTMLParagraphElement;
    private statusNode?: HTMLDivElement;
    private shareButton?: HTMLButtonElement;
    private muteAllButton?: HTMLButtonElement;
    private requestUnmuteButton?: HTMLButtonElement;
    private audienceTitleNode?: HTMLDivElement;
    private audienceListNode?: HTMLDivElement;
    private app?: ThisIsMyDepartmentApp;
    private refreshTimer?: number;
    private busy = false;

    public open(app: ThisIsMyDepartmentApp): void {
        this.app = app;
        if (!this.root) {
            this.root = this.createRoot();
            document.body.appendChild(this.root);
        }
        this.root.hidden = false;
        this.startRefreshLoop();
        this.refresh();
    }

    public close(): void {
        this.stopRefreshLoop();
        this.root?.remove();
        this.root = undefined;
        this.titleNode = undefined;
        this.subtitleNode = undefined;
        this.statusNode = undefined;
        this.shareButton = undefined;
        this.muteAllButton = undefined;
        this.requestUnmuteButton = undefined;
        this.audienceTitleNode = undefined;
        this.audienceListNode = undefined;
        this.app = undefined;
        this.busy = false;
    }

    public refresh(): void {
        if (!this.root || !this.app) {
            return;
        }

        const app = this.app;
        const audience = app.getPresentationAudience();
        const canModerate = app.canModeratePresentationAudience();
        const isScreenShareActive = app.isPresentationScreenShareActive();
        const mediaUnavailableReason = app.getPresentationMediaUnavailableReason();

        this.root.style.fontFamily = getUiFontStack(app.getLanguage());
        if (this.titleNode) {
            this.titleNode.textContent = app.t("presentation.controls.title");
        }
        if (this.subtitleNode) {
            this.subtitleNode.textContent = canModerate
                ? app.t("presentation.controls.subtitle")
                : app.t("presentation.controls.moderatorRequired");
        }
        if (this.statusNode && !this.statusNode.textContent) {
            this.statusNode.textContent = mediaUnavailableReason ?? app.t("presentation.controls.status.ready");
        }
        if (this.shareButton) {
            this.shareButton.textContent = app.t(isScreenShareActive
                ? "presentation.controls.share.stop"
                : "presentation.controls.share.start");
            this.shareButton.disabled = this.busy || !!mediaUnavailableReason;
            this.shareButton.style.opacity = this.shareButton.disabled ? "0.6" : "1";
            this.shareButton.style.cursor = this.shareButton.disabled ? "not-allowed" : "pointer";
            this.shareButton.title = mediaUnavailableReason ?? "";
        }
        if (this.muteAllButton) {
            this.muteAllButton.textContent = app.t("presentation.controls.muteAll");
            this.muteAllButton.disabled = this.busy || audience.length === 0 || !canModerate;
            this.muteAllButton.style.opacity = this.muteAllButton.disabled ? "0.6" : "1";
            this.muteAllButton.style.cursor = this.muteAllButton.disabled ? "not-allowed" : "pointer";
        }
        if (this.requestUnmuteButton) {
            this.requestUnmuteButton.textContent = app.t("presentation.controls.requestUnmuteAll");
            this.requestUnmuteButton.disabled = this.busy || audience.length === 0;
            this.requestUnmuteButton.style.opacity = this.requestUnmuteButton.disabled ? "0.6" : "1";
            this.requestUnmuteButton.style.cursor = this.requestUnmuteButton.disabled ? "not-allowed" : "pointer";
        }
        if (this.audienceTitleNode) {
            this.audienceTitleNode.textContent = app.t("presentation.controls.audience", { count: audience.length });
        }
        if (this.audienceListNode) {
            this.renderAudience(audience);
        }
    }

    private createRoot(): HTMLDivElement {
        const root = document.createElement("div");
        root.style.position = "fixed";
        root.style.top = "16px";
        root.style.right = "16px";
        root.style.zIndex = "9999";
        root.style.width = "320px";
        root.style.maxHeight = "calc(100vh - 32px)";
        root.style.overflow = "hidden";
        root.style.display = "grid";
        root.style.gridTemplateRows = "auto auto auto minmax(0, 1fr)";
        root.style.gap = "10px";
        root.style.padding = "16px";
        root.style.borderRadius = "18px";
        root.style.border = "1px solid rgba(164, 190, 255, 0.22)";
        root.style.background = "linear-gradient(160deg, rgba(22, 29, 44, 0.97), rgba(11, 16, 26, 0.97))";
        root.style.boxShadow = "0 22px 56px rgba(0, 0, 0, 0.42)";
        root.style.color = "#eef3ff";

        const title = document.createElement("div");
        title.style.fontSize = "20px";
        title.style.fontWeight = "700";
        this.titleNode = title;

        const subtitle = document.createElement("p");
        subtitle.style.margin = "0";
        subtitle.style.fontSize = "13px";
        subtitle.style.lineHeight = "1.5";
        subtitle.style.color = "#c3d1f3";
        this.subtitleNode = subtitle;

        const actions = document.createElement("div");
        actions.style.display = "grid";
        actions.style.gridTemplateColumns = "1fr";
        actions.style.gap = "8px";

        this.shareButton = this.createButton("rgba(72, 126, 255, 0.26)");
        this.shareButton.onclick = async () => {
            if (!this.app || this.busy) {
                return;
            }
            this.busy = true;
            this.refresh();
            this.setStatus(this.app.t("presentation.controls.status.sharing"));
            try {
                await this.app.togglePresentationScreenShare();
                window.setTimeout(() => this.refresh(), 400);
            } catch (error) {
                this.setStatus(error instanceof Error ? error.message : this.app.t("presentation.controls.errors.mediaUnavailable"));
            } finally {
                this.busy = false;
                this.refresh();
            }
        };

        this.muteAllButton = this.createButton("rgba(255, 122, 122, 0.16)");
        this.muteAllButton.onclick = async () => {
            if (!this.app || this.busy) {
                return;
            }
            this.busy = true;
            this.refresh();
            this.setStatus(this.app.t("presentation.controls.status.muting"));
            try {
                const count = await this.app.mutePresentationAudience();
                this.setStatus(this.app.t("presentation.controls.notifications.mutedAudience", { count }));
            } catch (error) {
                this.setStatus(error instanceof Error ? error.message : this.app.t("presentation.controls.errors.moderatorRequired"));
            } finally {
                this.busy = false;
                this.refresh();
            }
        };

        this.requestUnmuteButton = this.createButton("rgba(255, 194, 111, 0.12)");
        this.requestUnmuteButton.onclick = () => {
            if (!this.app || this.busy) {
                return;
            }
            const count = this.app.requestPresentationAudienceUnmute();
            this.setStatus(this.app.t("presentation.controls.notifications.requestSent", { count }));
            this.refresh();
        };

        actions.appendChild(this.shareButton);
        actions.appendChild(this.muteAllButton);
        actions.appendChild(this.requestUnmuteButton);

        const status = document.createElement("div");
        status.style.minHeight = "18px";
        status.style.fontSize = "12px";
        status.style.color = "#bac7e8";
        this.statusNode = status;

        const audienceSection = document.createElement("div");
        audienceSection.style.display = "grid";
        audienceSection.style.gridTemplateRows = "auto minmax(0, 1fr)";
        audienceSection.style.gap = "8px";
        audienceSection.style.minHeight = "0";

        const audienceTitle = document.createElement("div");
        audienceTitle.style.fontSize = "14px";
        audienceTitle.style.fontWeight = "600";
        this.audienceTitleNode = audienceTitle;

        const audienceList = document.createElement("div");
        audienceList.style.display = "grid";
        audienceList.style.gap = "8px";
        audienceList.style.maxHeight = "320px";
        audienceList.style.overflowY = "auto";
        audienceList.style.paddingRight = "2px";
        this.audienceListNode = audienceList;

        audienceSection.appendChild(audienceTitle);
        audienceSection.appendChild(audienceList);

        root.appendChild(title);
        root.appendChild(subtitle);
        root.appendChild(actions);
        root.appendChild(status);
        root.appendChild(audienceSection);
        return root;
    }

    private createButton(background: string): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.style.border = "1px solid rgba(164, 190, 255, 0.18)";
        button.style.borderRadius = "12px";
        button.style.padding = "11px 14px";
        button.style.textAlign = "left";
        button.style.fontSize = "14px";
        button.style.fontWeight = "600";
        button.style.color = "#eef3ff";
        button.style.background = background;
        button.style.cursor = "pointer";
        return button;
    }

    private renderAudience(audience: PresentationAudienceMember[]): void {
        if (!this.audienceListNode || !this.app) {
            return;
        }
        const app = this.app;

        this.audienceListNode.innerHTML = "";
        if (audience.length === 0) {
            const empty = document.createElement("div");
            empty.textContent = app.t("presentation.controls.audienceEmpty");
            empty.style.padding = "12px";
            empty.style.borderRadius = "12px";
            empty.style.border = "1px dashed rgba(164, 190, 255, 0.18)";
            empty.style.color = "#9fb0d8";
            empty.style.fontSize = "13px";
            this.audienceListNode.appendChild(empty);
            return;
        }

        audience.forEach(member => {
            const row = document.createElement("div");
            row.style.display = "grid";
            row.style.gridTemplateColumns = "minmax(0, 1fr) auto";
            row.style.gap = "8px";
            row.style.alignItems = "center";
            row.style.padding = "10px 12px";
            row.style.borderRadius = "12px";
            row.style.border = "1px solid rgba(164, 190, 255, 0.12)";
            row.style.background = "rgba(255, 255, 255, 0.04)";

            const identity = document.createElement("div");
            identity.style.minWidth = "0";

            const name = document.createElement("div");
            name.textContent = member.displayName;
            name.style.fontSize = "14px";
            name.style.fontWeight = "600";
            name.style.whiteSpace = "nowrap";
            name.style.overflow = "hidden";
            name.style.textOverflow = "ellipsis";

            const role = document.createElement("div");
            role.textContent = member.role || "member";
            role.style.marginTop = "2px";
            role.style.fontSize = "11px";
            role.style.color = "#90a9de";
            role.style.letterSpacing = "0.06em";
            role.style.textTransform = "uppercase";

            identity.appendChild(name);
            identity.appendChild(role);

            const badges = document.createElement("div");
            badges.style.display = "flex";
            badges.style.gap = "6px";
            badges.style.flexWrap = "wrap";
            badges.style.justifyContent = "flex-end";

            badges.appendChild(this.createBadge(
                member.audioMuted
                    ? app.t("presentation.controls.audienceAudioMuted")
                    : app.t("presentation.controls.audienceAudioLive"),
                member.audioMuted ? "rgba(255, 122, 122, 0.14)" : "rgba(72, 126, 255, 0.18)"
            ));
            badges.appendChild(this.createBadge(
                member.videoMuted
                    ? app.t("presentation.controls.audienceVideoMuted")
                    : app.t("presentation.controls.audienceVideoLive"),
                member.videoMuted ? "rgba(255, 194, 111, 0.14)" : "rgba(72, 126, 255, 0.18)"
            ));

            row.appendChild(identity);
            row.appendChild(badges);
            this.audienceListNode!.appendChild(row);
        });
    }

    private createBadge(text: string, background: string): HTMLSpanElement {
        const badge = document.createElement("span");
        badge.textContent = text;
        badge.style.padding = "3px 8px";
        badge.style.borderRadius = "999px";
        badge.style.fontSize = "11px";
        badge.style.color = "#e6eeff";
        badge.style.background = background;
        badge.style.border = "1px solid rgba(164, 190, 255, 0.14)";
        return badge;
    }

    private setStatus(message: string): void {
        if (this.statusNode) {
            this.statusNode.textContent = message;
        }
    }

    private startRefreshLoop(): void {
        this.stopRefreshLoop();
        this.refreshTimer = window.setInterval(() => this.refresh(), 1000);
    }

    private stopRefreshLoop(): void {
        if (this.refreshTimer != null) {
            window.clearInterval(this.refreshTimer);
            this.refreshTimer = undefined;
        }
    }
}