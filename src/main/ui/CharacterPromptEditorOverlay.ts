export interface CharacterPromptEditorOverlayOpenArgs {
    initialPrompt: string;
    onSave: (prompt: string) => Promise<void>;
    onCancel?: () => void;
}

export class CharacterPromptEditorOverlay {
    private backdrop?: HTMLDivElement;
    private textarea?: HTMLTextAreaElement;
    private saveButton?: HTMLButtonElement;
    private clearButton?: HTMLButtonElement;
    private cancelButton?: HTMLButtonElement;
    private currentArgs?: CharacterPromptEditorOverlayOpenArgs;
    private detachKeydown?: () => void;
    private busy = false;

    public open(args: CharacterPromptEditorOverlayOpenArgs): void {
        this.close();
        this.currentArgs = args;

        const backdrop = document.createElement("div");
        backdrop.style.position = "fixed";
        backdrop.style.top = "0";
        backdrop.style.right = "0";
        backdrop.style.bottom = "0";
        backdrop.style.left = "0";
        backdrop.style.background = "rgba(8, 10, 20, 0.68)";
        backdrop.style.display = "flex";
        backdrop.style.alignItems = "center";
        backdrop.style.justifyContent = "center";
        backdrop.style.zIndex = "9999";

        const panel = document.createElement("div");
        panel.style.width = "min(680px, calc(100vw - 32px))";
        panel.style.maxHeight = "calc(100vh - 32px)";
        panel.style.overflow = "auto";
        panel.style.background = "linear-gradient(180deg, rgba(25, 30, 46, 0.98), rgba(15, 18, 29, 0.98))";
        panel.style.border = "1px solid rgba(155, 182, 255, 0.35)";
        panel.style.borderRadius = "16px";
        panel.style.boxShadow = "0 24px 60px rgba(0, 0, 0, 0.4)";
        panel.style.padding = "20px";
        panel.style.color = "#f4f7ff";
        panel.style.fontFamily = "'Segoe UI', sans-serif";

        const title = document.createElement("h2");
        title.textContent = "Your Character AI Prompt";
        title.style.margin = "0 0 8px";
        title.style.fontSize = "24px";

        const description = document.createElement("p");
        description.textContent = "This prompt is for your own character when the system needs to control it while you are offline.";
        description.style.margin = "0 0 14px";
        description.style.color = "#c8d3f5";
        description.style.lineHeight = "1.5";

        const textarea = document.createElement("textarea");
        textarea.value = args.initialPrompt;
        textarea.rows = 12;
        textarea.placeholder = "Describe how your own character should speak, behave, remember context, and help others when AI-controlled offline.";
        textarea.style.width = "100%";
        textarea.style.boxSizing = "border-box";
        textarea.style.padding = "14px";
        textarea.style.borderRadius = "12px";
        textarea.style.border = "1px solid rgba(155, 182, 255, 0.25)";
        textarea.style.background = "rgba(7, 10, 18, 0.72)";
        textarea.style.color = "#f4f7ff";
        textarea.style.font = "14px/1.5 'SFMono-Regular', Consolas, monospace";
        textarea.style.resize = "vertical";
        textarea.style.minHeight = "220px";

        const statusNode = document.createElement("div");
        statusNode.style.minHeight = "20px";
        statusNode.style.marginTop = "10px";
        statusNode.style.color = "#d4defd";
        statusNode.style.fontSize = "13px";

        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "10px";
        actions.style.justifyContent = "flex-end";
        actions.style.marginTop = "18px";
        actions.style.flexWrap = "wrap";

        const cancelButton = document.createElement("button");
        cancelButton.textContent = "Cancel";
        const clearButton = document.createElement("button");
        clearButton.textContent = "Clear";
        const saveButton = document.createElement("button");
        saveButton.textContent = "Save";

        [cancelButton, clearButton, saveButton].forEach(button => {
            button.style.border = "1px solid rgba(155, 182, 255, 0.25)";
            button.style.borderRadius = "10px";
            button.style.padding = "10px 16px";
            button.style.font = "600 14px 'Segoe UI', sans-serif";
            button.style.cursor = "pointer";
        });

        cancelButton.style.background = "rgba(255, 255, 255, 0.08)";
        cancelButton.style.color = "#f4f7ff";
        clearButton.style.background = "rgba(255, 196, 110, 0.12)";
        clearButton.style.color = "#ffe1ad";
        saveButton.style.background = "rgba(94, 144, 255, 0.22)";
        saveButton.style.color = "#f4f7ff";

        const runSave = async (nextPrompt: string): Promise<void> => {
            if (this.busy || !this.currentArgs) {
                return;
            }
            this.busy = true;
            this.updateBusyState();
            statusNode.textContent = "Saving...";
            try {
                await this.currentArgs.onSave(nextPrompt);
                this.close();
            } catch (error) {
                statusNode.textContent = error instanceof Error ? error.message : "Save failed.";
            } finally {
                this.busy = false;
                this.updateBusyState();
            }
        };

        saveButton.onclick = () => {
            void runSave(textarea.value.trim());
        };
        clearButton.onclick = () => {
            textarea.value = "";
            void runSave("");
        };
        cancelButton.onclick = () => {
            this.close();
            args.onCancel?.();
        };
        backdrop.onclick = event => {
            if (event.target === backdrop && !this.busy) {
                this.close();
                args.onCancel?.();
            }
        };

        actions.appendChild(cancelButton);
        actions.appendChild(clearButton);
        actions.appendChild(saveButton);
        panel.appendChild(title);
        panel.appendChild(description);
        panel.appendChild(textarea);
        panel.appendChild(statusNode);
        panel.appendChild(actions);
        backdrop.appendChild(panel);
        document.body.appendChild(backdrop);

        this.detachKeydown = this.attachEscapeListener(args);
        this.backdrop = backdrop;
        this.textarea = textarea;
        this.saveButton = saveButton;
        this.clearButton = clearButton;
        this.cancelButton = cancelButton;

        requestAnimationFrame(() => textarea.focus());
    }

    public close(): void {
        this.detachKeydown?.();
        this.detachKeydown = undefined;
        this.backdrop?.remove();
        this.backdrop = undefined;
        this.textarea = undefined;
        this.saveButton = undefined;
        this.clearButton = undefined;
        this.cancelButton = undefined;
        this.currentArgs = undefined;
        this.busy = false;
    }

    private attachEscapeListener(args: CharacterPromptEditorOverlayOpenArgs): () => void {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === "Escape" && !this.busy) {
                event.preventDefault();
                this.close();
                args.onCancel?.();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }

    private updateBusyState(): void {
        const disabled = this.busy;
        if (this.textarea) {
            this.textarea.disabled = disabled;
        }
        if (this.saveButton) {
            this.saveButton.disabled = disabled;
        }
        if (this.clearButton) {
            this.clearButton.disabled = disabled;
        }
        if (this.cancelButton) {
            this.cancelButton.disabled = disabled;
        }
    }
}