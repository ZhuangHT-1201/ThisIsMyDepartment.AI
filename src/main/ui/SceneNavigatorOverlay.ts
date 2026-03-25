import { AppLanguage, getUiFontStack } from "../i18n";
import { ThisIsMyDepartmentApp } from "../ThisIsMyDepartmentApp";
import type { AvatarDirectoryUserSummary } from "../services/avatarDirectory";

export interface SceneNavigatorRoomEntry {
    id: string;
    name: string;
    subtitle?: string;
}

export interface SceneNavigatorAvatarEntry extends AvatarDirectoryUserSummary {
    statusLabel?: string;
}

interface SceneNavigatorOverlayArgs {
    language: AppLanguage;
    onTeleport: (roomId: string) => void;
    onRefreshUsers: () => Promise<void> | void;
    onSpawnAvatar: (userId: string) => Promise<void> | void;
}

type SceneNavigatorTabId = "rooms" | "avatars";

export class SceneNavigatorOverlay {
    private app?: ThisIsMyDepartmentApp;
    private args?: SceneNavigatorOverlayArgs;
    private root?: HTMLDivElement;
    private rooms: SceneNavigatorRoomEntry[] = [];
    private avatars: SceneNavigatorAvatarEntry[] = [];
    private loadingUsers = false;
    private userError: string | null = null;
    private busyUserId: string | null = null;
    private activeAvatarLabel: string | null = null;
    private activeTab: SceneNavigatorTabId = "rooms";
    private collapsed = false;

    public open(app: ThisIsMyDepartmentApp, args: SceneNavigatorOverlayArgs): void {
        this.app = app;
        this.args = args;
        if (!this.root) {
            this.root = document.createElement("div");
            this.root.className = "timd-scene-navigator";
            document.body.appendChild(this.root);
        }
        this.root.hidden = false;
        this.applyCollapsedState();
        this.render();
    }

    public close(): void {
        this.root?.remove();
        this.root = undefined;
        this.app = undefined;
        this.args = undefined;
    }

    public setLanguage(language: AppLanguage): void {
        if (!this.args) {
            return;
        }
        this.args = {
            ...this.args,
            language
        };
        this.render();
    }

    public setRooms(rooms: SceneNavigatorRoomEntry[]): void {
        this.rooms = rooms;
        this.render();
    }

    public setAvatars(avatars: SceneNavigatorAvatarEntry[]): void {
        this.avatars = avatars;
        this.render();
    }

    public setLoadingUsers(loading: boolean): void {
        this.loadingUsers = loading;
        this.render();
    }

    public setUserError(message: string | null): void {
        this.userError = message;
        this.render();
    }

    public setBusyUserId(userId: string | null): void {
        this.busyUserId = userId;
        this.render();
    }

    public setActiveAvatarLabel(label: string | null): void {
        this.activeAvatarLabel = label;
        this.render();
    }

    private render(): void {
        if (!this.root || !this.app || !this.args) {
            return;
        }

        const app = this.app;
        const language = this.args.language;
        this.root.innerHTML = "";
        this.root.style.fontFamily = getUiFontStack(language);

        const panel = document.createElement("div");
        panel.className = "timd-scene-navigator__panel";

        const collapseButton = document.createElement("button");
        collapseButton.type = "button";
        collapseButton.className = "timd-sidebar-toggle timd-sidebar-toggle--navigator";
        collapseButton.textContent = this.collapsed ? "›" : "‹";
        collapseButton.title = this.collapsed ? "Expand navigator panel" : "Collapse navigator panel";
        collapseButton.setAttribute("aria-label", collapseButton.title);
        collapseButton.onclick = () => {
            this.collapsed = !this.collapsed;
            this.applyCollapsedState();
            this.render();
        };

        const header = document.createElement("div");
        header.className = "timd-scene-navigator__header";

        const title = document.createElement("div");
        title.className = "timd-scene-navigator__title";
        title.textContent = app.t("navigator.title");

        const subtitleText = app.t("navigator.subtitle").trim();

        header.appendChild(title);
        if (subtitleText) {
            const subtitle = document.createElement("div");
            subtitle.className = "timd-scene-navigator__subtitle";
            subtitle.textContent = subtitleText;
            header.appendChild(subtitle);
        }

        const tabs = document.createElement("div");
        tabs.className = "timd-scene-navigator__tabs";
        tabs.appendChild(this.createTabButton("rooms", app.t("navigator.tab.rooms")));
        tabs.appendChild(this.createTabButton("avatars", app.t("navigator.tab.avatars")));

        const body = document.createElement("div");
        body.className = "timd-scene-navigator__body";

        const roomsSection = document.createElement("section");
        roomsSection.className = "timd-scene-navigator__section";
        roomsSection.hidden = this.activeTab !== "rooms";
        roomsSection.appendChild(this.createSectionHeader(app.t("navigator.rooms.title"), app.t("navigator.rooms.subtitle")));
        if (this.rooms.length === 0) {
            roomsSection.appendChild(this.createEmptyState(app.t("navigator.rooms.empty")));
        } else {
            const roomList = document.createElement("div");
            roomList.className = "timd-scene-navigator__list";
            this.rooms.forEach(room => {
                const item = this.createListItem({
                    title: room.name,
                    subtitle: room.subtitle,
                    actionLabel: app.t("navigator.rooms.teleport"),
                    onAction: () => this.args?.onTeleport(room.id)
                });
                roomList.appendChild(item);
            });
            roomsSection.appendChild(roomList);
        }

        const avatarsSection = document.createElement("section");
        avatarsSection.className = "timd-scene-navigator__section";
        avatarsSection.hidden = this.activeTab !== "avatars";

        const avatarsHeader = this.createSectionHeader(app.t("navigator.avatars.title"), app.t("navigator.avatars.subtitle"));
        const refreshButton = document.createElement("button");
        refreshButton.type = "button";
        refreshButton.className = "timd-scene-navigator__refresh";
        refreshButton.textContent = this.loadingUsers ? app.t("navigator.avatars.loading") : app.t("navigator.avatars.refresh");
        refreshButton.disabled = this.loadingUsers || !!this.busyUserId;
        refreshButton.onclick = () => {
            void this.args?.onRefreshUsers();
        };
        avatarsHeader.appendChild(refreshButton);
        avatarsSection.appendChild(avatarsHeader);

        const activeAvatar = document.createElement("div");
        activeAvatar.className = "timd-scene-navigator__active-avatar";
        activeAvatar.textContent = this.activeAvatarLabel
            ? app.t("navigator.avatars.active", { name: this.activeAvatarLabel })
            : app.t("navigator.avatars.noneActive");
        avatarsSection.appendChild(activeAvatar);

        if (this.userError) {
            const error = document.createElement("div");
            error.className = "timd-scene-navigator__error";
            error.textContent = this.userError;
            avatarsSection.appendChild(error);
        }

        if (this.avatars.length === 0) {
            avatarsSection.appendChild(this.createEmptyState(this.loadingUsers ? app.t("navigator.avatars.loading") : app.t("navigator.avatars.empty")));
        } else {
            const avatarList = document.createElement("div");
            avatarList.className = "timd-scene-navigator__list";
            this.avatars.forEach(avatar => {
                const canSpawn = !!avatar.avatar && !avatar.isOnline;
                const spawnButtonLabel = this.busyUserId === avatar.userId
                    ? app.t("navigator.avatars.spawning")
                    : app.t("navigator.avatars.spawn");
                const subtitleParts = [
                    avatar.department,
                    avatar.organization,
                    avatar.roles.length > 0 ? avatar.roles.join(", ") : undefined,
                    avatar.statusLabel
                ].filter(Boolean);
                const item = this.createListItem({
                    title: avatar.displayName,
                    subtitle: subtitleParts.join(" · ") || undefined,
                    actionLabel: canSpawn ? spawnButtonLabel : app.t("navigator.avatars.unavailable"),
                    actionDisabled: !canSpawn || !!this.busyUserId,
                    onAction: () => {
                        void this.args?.onSpawnAvatar(avatar.userId);
                    }
                });
                avatarList.appendChild(item);
            });
            avatarsSection.appendChild(avatarList);
        }

        body.appendChild(roomsSection);
        body.appendChild(avatarsSection);

        panel.appendChild(collapseButton);
        panel.appendChild(header);
        panel.appendChild(tabs);
        panel.appendChild(body);
        this.root.appendChild(panel);
        this.applyCollapsedState();
    }

    private applyCollapsedState(): void {
        if (!this.root) {
            return;
        }

        this.root.classList.toggle("timd-scene-navigator--collapsed", this.collapsed);
    }

    private createTabButton(tabId: SceneNavigatorTabId, label: string): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.className = this.activeTab === tabId
            ? "timd-scene-navigator__tab timd-scene-navigator__tab--active"
            : "timd-scene-navigator__tab";
        button.textContent = label;
        button.onclick = () => {
            if (this.activeTab === tabId) {
                return;
            }
            this.activeTab = tabId;
            this.render();

            if (tabId === "avatars") {
                void this.args?.onRefreshUsers();
            }
        };
        return button;
    }

    private createSectionHeader(titleText: string, subtitleText: string): HTMLDivElement {
        const wrapper = document.createElement("div");
        wrapper.className = "timd-scene-navigator__section-header";

        const copy = document.createElement("div");
        copy.className = "timd-scene-navigator__section-copy";

        const title = document.createElement("div");
        title.className = "timd-scene-navigator__section-title";
        title.textContent = titleText;

        const subtitle = document.createElement("div");
        subtitle.className = "timd-scene-navigator__section-subtitle";
        subtitle.textContent = subtitleText;

        copy.appendChild(title);
        copy.appendChild(subtitle);
        wrapper.appendChild(copy);
        return wrapper;
    }

    private createEmptyState(message: string): HTMLDivElement {
        const empty = document.createElement("div");
        empty.className = "timd-scene-navigator__empty";
        empty.textContent = message;
        return empty;
    }

    private createListItem(args: {
        title: string;
        subtitle?: string;
        actionLabel: string;
        actionDisabled?: boolean;
        onAction: () => void;
    }): HTMLDivElement {
        const item = document.createElement("div");
        item.className = "timd-scene-navigator__item";

        const copy = document.createElement("div");
        copy.className = "timd-scene-navigator__item-copy";

        const title = document.createElement("div");
        title.className = "timd-scene-navigator__item-title";
        title.textContent = args.title;

        copy.appendChild(title);
        if (args.subtitle) {
            const subtitle = document.createElement("div");
            subtitle.className = "timd-scene-navigator__item-subtitle";
            subtitle.textContent = args.subtitle;
            copy.appendChild(subtitle);
        }

        const action = document.createElement("button");
        action.type = "button";
        action.className = "timd-scene-navigator__action";
        action.textContent = args.actionLabel;
        action.disabled = !!args.actionDisabled;
        action.onclick = args.onAction;

        item.appendChild(copy);
        item.appendChild(action);
        return item;
    }
}