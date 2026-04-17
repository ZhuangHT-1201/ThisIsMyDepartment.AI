import { Direction } from "../../engine/geom/Direction";
import { SceneNode } from "../../engine/scene/SceneNode";
import { Signal } from "../../engine/util/Signal";
import { Layer } from "../constants";
import { AppLanguage, DEFAULT_LANGUAGE, getUiFontStack, translate } from "../i18n";
import type { ThisIsMyDepartmentApp } from "../ThisIsMyDepartmentApp";

export interface ConversationEntry {
    senderId: string;
    senderName: string;
    text: string;
    timestamp: number;
    fromSelf?: boolean;
    authoredByAi?: boolean;
    audioBlob?: Blob;
    audioUrl?: string;
    audioDuration?: number;
}

export interface ConversationWindowDisplayOptions {
    modeLabel?: string;
    placeholder?: string;
    submitLabel?: string;
    statusText?: string;
    indicatorText?: string;
    indicatorTone?: "neutral" | "active" | "warning" | "error";
    disabled?: boolean;
}

export class ConversationWindow extends SceneNode<ThisIsMyDepartmentApp> {
    public readonly onSubmit = new Signal<string>();
    public readonly onVoiceSubmit = new Signal<{ blob: Blob, url: string, duration: number }>(); 
    public readonly onCloseRequested = new Signal<void>();
    private discreteMediaRecorder: any = null;
    private voiceChunks: Blob[] = [];
    private recordButton?: HTMLButtonElement;
    private recordingStartTime: number = 0;
    private partnerLabel: string = "";
    private visibleEntries: ConversationEntry[] = [];
    private modeLabel = "Conversation";
    private placeholder = "Type a message...";
    private submitLabel = "Send";
    private statusText = "Enter to send. Shift+Enter for newline.";
    private indicatorText = "";
    private indicatorTone: "neutral" | "active" | "warning" | "error" = "neutral";
    private composerDisabled = false;
    private language: AppLanguage = DEFAULT_LANGUAGE;
    private domRoot?: HTMLDivElement;
    private headerTitle?: HTMLDivElement;
    private headerMeta?: HTMLDivElement;
    private headerIndicator?: HTMLDivElement;
    private historyElement?: HTMLDivElement;
    private composerInput?: HTMLTextAreaElement;
    private composerSubmit?: HTMLButtonElement;
    private statusElement?: HTMLDivElement;
    private closeButton?: HTMLButtonElement;
    private viewportLayout?: { left: number; top: number; width: number; height: number };

    public constructor() {
        super({ anchor: Direction.TOP_RIGHT, childAnchor: Direction.TOP_LEFT, layer: Layer.HUD });

        this.resizeTo(380, 420);
        this.hideWindow();
    }

    public showConversation(partnerLabel: string, entries: ConversationEntry[], options?: ConversationWindowDisplayOptions): void {
        this.partnerLabel = partnerLabel;
        this.visibleEntries = entries.slice();
        if (options) {
            this.modeLabel = options.modeLabel ?? this.modeLabel;
            this.placeholder = options.placeholder ?? this.placeholder;
            this.submitLabel = options.submitLabel ?? this.submitLabel;
            this.statusText = options.statusText ?? this.statusText;
            this.indicatorText = options.indicatorText ?? this.indicatorText;
            this.indicatorTone = options.indicatorTone ?? this.indicatorTone;
            this.composerDisabled = options.disabled ?? this.composerDisabled;
        }
        this.pushDebugEvent("show", {
            partnerLabel,
            entries: this.visibleEntries.length
        });
        this.ensureDom();
        this.setHidden(false);
        this.renderConversation();
        this.syncDomPosition();
        this.invalidate();
    }

    public hideWindow(): void {
        this.setHidden(true);
        this.pushDebugEvent("hide");
        if (this.domRoot) {
            this.domRoot.style.display = "none";
        }
    }

    public setViewportLayout(left: number, top: number, width: number, height: number): void {
        this.viewportLayout = { left, top, width, height };
        this.resizeTo(width, height);
        this.moveTo(left + width, top);
        this.pushDebugEvent("layout", this.viewportLayout);
        this.syncDomPosition();
    }

    public layoutWithin(width: number, height: number): void {
        const margin = 16;
        this.moveTo(width - margin, margin);
        this.syncDomPosition();
    }

    public draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        this.syncDomPosition();
        super.draw(ctx, width, height);
    }

    public focusComposer(): void {
        this.ensureDom();
        if (!this.isHidden()) {
            this.composerInput?.focus();
        }
    }

    public blurComposer(): void {
        this.composerInput?.blur();
        this.setGameInputBlocked(false);
    }

    public clearComposer(): void {
        if (!this.composerInput) {
            return;
        }
        this.composerInput.value = "";
        this.resizeComposer();
    }

    public updateComposer(options: ConversationWindowDisplayOptions): void {
        this.modeLabel = options.modeLabel ?? this.modeLabel;
        this.placeholder = options.placeholder ?? this.placeholder;
        this.submitLabel = options.submitLabel ?? this.submitLabel;
        this.statusText = options.statusText ?? this.statusText;
        this.indicatorText = options.indicatorText ?? this.indicatorText;
        this.indicatorTone = options.indicatorTone ?? this.indicatorTone;
        this.composerDisabled = options.disabled ?? this.composerDisabled;
        this.ensureDom();
        this.renderComposerState();
    }

    public setLanguage(language: AppLanguage): void {
        this.language = language;
        if (this.domRoot) {
            this.domRoot.style.fontFamily = getUiFontStack(this.language);
        }
        this.renderConversation();
    }

    protected activate(): void {
        super.activate();
        this.ensureDom();
        this.syncDomPosition();
    }

    protected deactivate(): void {
        this.setGameInputBlocked(false);
        if (this.domRoot?.parentElement) {
            this.domRoot.parentElement.removeChild(this.domRoot);
        }
        super.deactivate();
    }

    protected update(dt: number, time: number): void {
        super.update(dt, time);
        this.syncDomPosition();
    }

    private ensureDom(): void {
        if (!this.domRoot) {
            const root = document.createElement("div");
            root.style.position = "fixed";
            root.style.display = "none";
            root.style.zIndex = "3500";
            root.style.pointerEvents = "auto";
            root.style.borderRadius = "22px";
            root.style.overflow = "hidden";
            root.style.background = "linear-gradient(180deg, rgba(10, 26, 43, 0.96) 0%, rgba(16, 20, 29, 0.96) 100%)";
            root.style.border = "1px solid rgba(255, 255, 255, 0.14)";
            root.style.boxShadow = "0 20px 40px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
            root.style.setProperty("backdrop-filter", "blur(8px)");
            root.style.color = "#f4f7fb";
            root.style.fontFamily = getUiFontStack(this.language);

            const shell = document.createElement("div");
            shell.style.display = "flex";
            shell.style.flexDirection = "column";
            shell.style.width = "100%";
            shell.style.height = "100%";
            root.appendChild(shell);

            const header = document.createElement("div");
            header.style.display = "flex";
            header.style.alignItems = "center";
            header.style.justifyContent = "space-between";
            header.style.gap = "12px";
            header.style.padding = "16px 18px 14px";
            header.style.background = "linear-gradient(135deg, rgba(72, 166, 255, 0.22), rgba(255, 159, 103, 0.12))";
            header.style.borderBottom = "1px solid rgba(255, 255, 255, 0.08)";
            shell.appendChild(header);

            const heading = document.createElement("div");
            heading.style.minWidth = "0";
            header.appendChild(heading);

            this.headerMeta = document.createElement("div");
            this.headerMeta.style.fontSize = "11px";
            this.headerMeta.style.letterSpacing = "0.12em";
            this.headerMeta.style.textTransform = "uppercase";
            this.headerMeta.style.color = "rgba(214, 230, 246, 0.72)";
            this.headerMeta.style.marginBottom = "4px";
            heading.appendChild(this.headerMeta);

            this.headerTitle = document.createElement("div");
            this.headerTitle.style.fontSize = "18px";
            this.headerTitle.style.fontWeight = "700";
            this.headerTitle.style.lineHeight = "1.2";
            this.headerTitle.style.whiteSpace = "nowrap";
            this.headerTitle.style.overflow = "hidden";
            this.headerTitle.style.textOverflow = "ellipsis";
            heading.appendChild(this.headerTitle);

            const headerActions = document.createElement("div");
            headerActions.style.display = "flex";
            headerActions.style.alignItems = "center";
            headerActions.style.gap = "10px";
            header.appendChild(headerActions);

            this.headerIndicator = document.createElement("div");
            this.headerIndicator.style.display = "none";
            this.headerIndicator.style.alignItems = "center";
            this.headerIndicator.style.justifyContent = "center";
            this.headerIndicator.style.minHeight = "30px";
            this.headerIndicator.style.padding = "6px 10px";
            this.headerIndicator.style.borderRadius = "999px";
            this.headerIndicator.style.fontSize = "11px";
            this.headerIndicator.style.fontWeight = "700";
            this.headerIndicator.style.letterSpacing = "0.04em";
            this.headerIndicator.style.whiteSpace = "nowrap";
            headerActions.appendChild(this.headerIndicator);

            const closeButton = document.createElement("button");
            closeButton.type = "button";
            closeButton.textContent = this.t("conversation.close");
            closeButton.style.border = "none";
            closeButton.style.borderRadius = "999px";
            closeButton.style.padding = "8px 12px";
            closeButton.style.background = "rgba(255, 255, 255, 0.12)";
            closeButton.style.color = "#ffffff";
            closeButton.style.font = `600 12px ${getUiFontStack(this.language)}`;
            closeButton.style.cursor = "pointer";
            closeButton.addEventListener("click", () => this.onCloseRequested.emit(undefined));
            this.closeButton = closeButton;
            headerActions.appendChild(closeButton);

            this.historyElement = document.createElement("div");
            this.historyElement.style.flex = "1";
            this.historyElement.style.overflowY = "auto";
            this.historyElement.style.padding = "18px";
            this.historyElement.style.display = "flex";
            this.historyElement.style.flexDirection = "column";
            this.historyElement.style.gap = "12px";
            this.historyElement.style.background = "linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0))";
            shell.appendChild(this.historyElement);

            const composerWrap = document.createElement("div");
            composerWrap.style.display = "flex";
            composerWrap.style.flexDirection = "column";
            composerWrap.style.gap = "10px";
            composerWrap.style.padding = "16px 18px 18px";
            composerWrap.style.borderTop = "1px solid rgba(255, 255, 255, 0.08)";
            composerWrap.style.background = "rgba(7, 14, 22, 0.72)";
            shell.appendChild(composerWrap);

            const composerForm = document.createElement("form");
            composerForm.style.display = "flex";
            composerForm.style.flexDirection = "column";
            composerForm.style.gap = "10px";
            composerForm.addEventListener("submit", event => {
                event.preventDefault();
                this.handleSubmit();
            });
            composerWrap.appendChild(composerForm);

            this.composerInput = document.createElement("textarea");
            this.composerInput.rows = 2;
            this.composerInput.spellcheck = true;
            this.composerInput.style.width = "100%";
            this.composerInput.style.minHeight = "72px";
            this.composerInput.style.maxHeight = "132px";
            this.composerInput.style.resize = "none";
            this.composerInput.style.padding = "14px 16px";
            this.composerInput.style.borderRadius = "16px";
            this.composerInput.style.border = "1px solid rgba(139, 192, 255, 0.24)";
            this.composerInput.style.background = "rgba(255, 255, 255, 0.07)";
            this.composerInput.style.color = "#f7fbff";
            this.composerInput.style.font = `500 14px/1.5 ${getUiFontStack(this.language)}`;
            this.composerInput.style.outline = "none";
            this.composerInput.style.boxSizing = "border-box";
            this.composerInput.addEventListener("input", () => this.resizeComposer());
            this.composerInput.addEventListener("focus", () => this.setGameInputBlocked(true));
            this.composerInput.addEventListener("blur", () => this.setGameInputBlocked(false));
            this.composerInput.addEventListener("keydown", event => {
                event.stopPropagation();
                if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                    event.preventDefault();
                    this.handleSubmit();
                }
            });
            this.composerInput.addEventListener("keypress", event => {
                event.stopPropagation();
            });
            this.composerInput.addEventListener("keyup", event => {
                event.stopPropagation();
            });
            composerForm.appendChild(this.composerInput);

            const footer = document.createElement("div");
            footer.style.display = "flex";
            footer.style.alignItems = "center";
            footer.style.justifyContent = "space-between";
            footer.style.gap = "12px";
            composerForm.appendChild(footer);

            this.statusElement = document.createElement("div");
            this.statusElement.style.fontSize = "12px";
            this.statusElement.style.color = "rgba(215, 228, 239, 0.72)";
            this.statusElement.style.lineHeight = "1.4";
            footer.appendChild(this.statusElement);

            this.composerSubmit = document.createElement("button");
            this.composerSubmit.type = "submit";
            this.composerSubmit.style.border = "none";
            this.composerSubmit.style.borderRadius = "999px";
            this.composerSubmit.style.padding = "10px 18px";
            this.composerSubmit.style.background = "linear-gradient(135deg, #4db8ff 0%, #ff9f67 100%)";
            this.composerSubmit.style.color = "#08131d";
            this.composerSubmit.style.font = `700 12px ${getUiFontStack(this.language)}`;
            this.composerSubmit.style.letterSpacing = "0.04em";
            this.composerSubmit.style.cursor = "pointer";
            footer.appendChild(this.composerSubmit);
            this.recordButton = document.createElement("button");
            this.recordButton.type = "button";
            this.recordButton.style.border = "none";
            this.recordButton.style.borderRadius = "999px";
            this.recordButton.style.padding = "10px 18px";
            this.recordButton.style.background = "linear-gradient(135deg, #4dff88 0%, #32b35a 100%)";
            this.recordButton.style.color = "#08131d";
            this.recordButton.style.font = `700 12px ${getUiFontStack(this.language)}`;
            this.recordButton.style.cursor = "pointer";
            this.recordButton.textContent = "按住说话";
            this.recordButton.addEventListener("mousedown", () => this.startRecordingVoice());
            this.recordButton.addEventListener("mouseup", () => this.stopRecordingVoice());
            this.recordButton.addEventListener("mouseleave", () => this.stopRecordingVoice());
            footer.appendChild(this.recordButton);
            this.domRoot = root;
        }

        if (this.domRoot && !this.domRoot.parentElement) {
            document.body.appendChild(this.domRoot);
        }

        this.renderComposerState();
    }

    private renderConversation(): void {
        if (!this.domRoot || !this.historyElement || !this.headerTitle || !this.headerMeta) {
            return;
        }

        const historyElement = this.historyElement;
        const shouldStickToBottom = this.isScrolledToBottom();
        this.domRoot.style.display = this.isHidden() ? "none" : "block";
        this.headerTitle.textContent = this.partnerLabel || this.t("conversation.title.default");
        this.headerMeta.textContent = this.modeLabel;
        historyElement.innerHTML = "";

        if (this.visibleEntries.length === 0) {
            const emptyState = document.createElement("div");
            emptyState.textContent = this.t("conversation.empty");
            emptyState.style.padding = "20px 18px";
            emptyState.style.borderRadius = "18px";
            emptyState.style.background = "rgba(255, 255, 255, 0.05)";
            emptyState.style.color = "rgba(224, 233, 244, 0.72)";
            emptyState.style.fontSize = "13px";
            emptyState.style.lineHeight = "1.5";
            historyElement.appendChild(emptyState);
        }

        this.visibleEntries.forEach(entry => {
            const message = document.createElement("div");
            const fromSelf = !!entry.fromSelf;
            message.style.display = "flex";
            message.style.flexDirection = "column";
            message.style.alignItems = fromSelf ? "flex-end" : "flex-start";
            message.style.gap = "4px";

            const meta = document.createElement("div");
            meta.textContent = `${this.formatSenderLabel(entry)} • ${this.formatTime(entry.timestamp)}`;
            meta.style.fontSize = "11px";
            meta.style.letterSpacing = "0.03em";
            meta.style.color = fromSelf ? "rgba(173, 226, 255, 0.82)" : "rgba(244, 217, 197, 0.82)";
            message.appendChild(meta);

            const bubble = document.createElement("div");
            if (entry.audioUrl && entry.audioBlob) {
                const playBtn = document.createElement("button");
                playBtn.textContent = "播放语音";
                playBtn.style.background = "rgba(255,255,255,0.2)";
                playBtn.style.border = "none";
                playBtn.style.color = "white";
                playBtn.style.padding = "4px 8px";
                playBtn.style.borderRadius = "4px";
                playBtn.style.cursor = "pointer";
                playBtn.style.marginRight = "8px";
                playBtn.onclick = () => {
                    const audio = new Audio(entry.audioUrl);
                    audio.play();
                };
                const durationSpan = document.createElement("span");
                durationSpan.textContent = entry.audioDuration ? `${entry.audioDuration}s` : "";
                durationSpan.style.color = "rgba(255, 255, 255, 0.6)"; 
                durationSpan.style.fontSize = "12px";
                durationSpan.style.marginRight = "12px";
                durationSpan.style.display = "inline-block";
                durationSpan.style.verticalAlign = "middle";
                const transBtn = document.createElement("button");
                transBtn.textContent = "转文字";
                transBtn.style.background = "transparent";
                transBtn.style.border = "1px solid rgba(255,255,255,0.4)";
                transBtn.style.color = "white";
                transBtn.style.padding = "3px 6px";
                transBtn.style.borderRadius = "4px";
                transBtn.style.cursor = "pointer";
                transBtn.style.fontSize = "12px";

                const textContainer = document.createElement("div");
                textContainer.style.marginTop = "8px";
                textContainer.style.borderTop = "1px dashed rgba(255,255,255,0.2)";
                textContainer.style.paddingTop = "4px";
                
                if (entry.text && entry.text !== "[语音消息]") {
                    textContainer.textContent = entry.text;
                    transBtn.style.display = "none";
                }

                transBtn.onclick = async () => {
                    transBtn.textContent = "正在转录...";
                    transBtn.disabled = true;
                    const formData = new FormData();
                    formData.append("file", entry.audioBlob!, "audio.webm");
                    try {
                        const res = await fetch("http://127.0.0.1:8001/transcribe", { method: "POST", body: formData });
                        const data = await res.json();
                        textContainer.textContent = data.text;
                        entry.text = data.text; 
                        transBtn.style.display = "none";
                    } catch(e) {
                        transBtn.textContent = "失败，重试";
                        transBtn.disabled = false;
                    }
                };

                bubble.appendChild(playBtn);
                bubble.appendChild(durationSpan);
                bubble.appendChild(transBtn);
                bubble.appendChild(textContainer);
            } else {
                bubble.textContent = entry.text; 
            }
            bubble.style.maxWidth = "86%";
            bubble.style.whiteSpace = "pre-wrap";
            bubble.style.wordBreak = "break-word";
            bubble.style.padding = "12px 14px";
            bubble.style.borderRadius = fromSelf ? "18px 18px 6px 18px" : "18px 18px 18px 6px";
            bubble.style.background = fromSelf
                ? "linear-gradient(135deg, rgba(83, 187, 255, 0.32), rgba(77, 124, 255, 0.18))"
                : "linear-gradient(135deg, rgba(255, 176, 118, 0.22), rgba(255, 255, 255, 0.08))";
            bubble.style.border = "1px solid rgba(255, 255, 255, 0.08)";
            bubble.style.boxShadow = "inset 0 1px 0 rgba(255, 255, 255, 0.04)";
            bubble.style.fontSize = "14px";
            bubble.style.lineHeight = "1.5";
            message.appendChild(bubble);

            historyElement.appendChild(message);
        });

        this.renderComposerState();
        if (shouldStickToBottom) {
            historyElement.scrollTop = historyElement.scrollHeight;
        }
    }

    private renderComposerState(): void {
        if (!this.composerInput || !this.composerSubmit || !this.statusElement) {
            return;
        }
        if (this.headerMeta) {
            this.headerMeta.textContent = this.modeLabel;
        }
        if (this.headerIndicator) {
            const indicatorVisible = this.indicatorText.trim().length > 0;
            this.headerIndicator.style.display = indicatorVisible ? "inline-flex" : "none";
            this.headerIndicator.textContent = this.indicatorText;
            switch (this.indicatorTone) {
                case "active":
                    this.headerIndicator.style.background = "rgba(67, 199, 125, 0.18)";
                    this.headerIndicator.style.border = "1px solid rgba(100, 226, 154, 0.32)";
                    this.headerIndicator.style.color = "#b8ffd6";
                    break;
                case "warning":
                    this.headerIndicator.style.background = "rgba(255, 183, 77, 0.18)";
                    this.headerIndicator.style.border = "1px solid rgba(255, 201, 107, 0.34)";
                    this.headerIndicator.style.color = "#ffe2aa";
                    break;
                case "error":
                    this.headerIndicator.style.background = "rgba(255, 107, 107, 0.18)";
                    this.headerIndicator.style.border = "1px solid rgba(255, 140, 140, 0.34)";
                    this.headerIndicator.style.color = "#ffd0d0";
                    break;
                default:
                    this.headerIndicator.style.background = "rgba(214, 230, 246, 0.12)";
                    this.headerIndicator.style.border = "1px solid rgba(214, 230, 246, 0.18)";
                    this.headerIndicator.style.color = "rgba(232, 240, 247, 0.92)";
                    break;
            }
        }
        if (this.closeButton) {
            this.closeButton.textContent = this.t("conversation.close");
            this.closeButton.style.font = `600 12px ${getUiFontStack(this.language)}`;
        }
        this.composerInput.placeholder = this.placeholder;
        this.composerInput.disabled = this.composerDisabled;
        this.composerSubmit.disabled = this.composerDisabled;
        this.composerSubmit.textContent = this.submitLabel;
        this.statusElement.textContent = this.statusText;
        this.composerSubmit.style.opacity = this.composerDisabled ? "0.6" : "1";
        this.composerSubmit.style.cursor = this.composerDisabled ? "default" : "pointer";
        this.composerInput.style.opacity = this.composerDisabled ? "0.72" : "1";
    }

    private formatSenderLabel(entry: ConversationEntry): string {
        const baseLabel = entry.fromSelf ? this.t("conversation.sender.you") : entry.senderName;
        if (!entry.authoredByAi) {
            return baseLabel;
        }

        return `${baseLabel} (${this.t("conversation.sender.ai")})`;
    }

    private t(key: string, params?: Record<string, string | number>): string {
        return translate(this.language, key, params);
    }

    private handleSubmit(): void {
        if (this.composerDisabled || !this.composerInput) {
            return;
        }
        const text = this.composerInput.value.trim();
        if (!text) {
            this.composerInput.focus();
            return;
        }
        this.onSubmit.emit(text);
    }

    private async startRecordingVoice() {
        if (this.recordButton) this.recordButton.textContent = "松开发送...";
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.discreteMediaRecorder = new (window as any).MediaRecorder(stream, { mimeType: 'audio/webm' });
            this.voiceChunks = [];

            this.discreteMediaRecorder!.ondataavailable = (e: any) => this.voiceChunks.push(e.data);
            
            this.discreteMediaRecorder!.onstop = () => {
                if (this.voiceChunks.length > 0) {
                    const blob = new Blob(this.voiceChunks, { type: 'audio/webm' });
                    const url = URL.createObjectURL(blob);
                    
                    const durationSeconds = Math.max(1, Math.round((Date.now() - this.recordingStartTime) / 1000));
                    
                    this.onVoiceSubmit.emit({ blob, url, duration: durationSeconds });
                }
                stream.getTracks().forEach((track: any) => track.stop());
                if (this.recordButton) this.recordButton.textContent = "按住说话";
            };

            this.recordingStartTime = Date.now();
            this.discreteMediaRecorder!.start();
        } catch (err) {
            console.error("录音失败", err);
            if (this.recordButton) this.recordButton.textContent = "麦克风权限被拒";
        }
    }

    private stopRecordingVoice() {
        if (this.discreteMediaRecorder && this.discreteMediaRecorder.state === "recording") {
            this.discreteMediaRecorder.stop();
        }
    }

    private resizeComposer(): void {
        if (!this.composerInput) {
            return;
        }
        this.composerInput.style.height = "auto";
        this.composerInput.style.height = `${Math.min(this.composerInput.scrollHeight, 132)}px`;
    }

    private syncDomPosition(): void {
        if (this.isHidden() || !this.domRoot) {
            return;
        }
        const scene = this.getScene();
        if (!scene) {
            return;
        }
        const canvas = scene.game.canvas;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width === 0 ? 1 : rect.width / canvas.width;
        const scaleY = canvas.height === 0 ? 1 : rect.height / canvas.height;
        const targetWidth = (this.viewportLayout?.width ?? this.getWidth()) * scaleX;
        const targetHeight = (this.viewportLayout?.height ?? this.getHeight()) * scaleY;
        const rawLeft = rect.left + (this.viewportLayout?.left ?? this.getLeft()) * scaleX;
        const rawTop = rect.top + (this.viewportLayout?.top ?? this.getTop()) * scaleY;
        const maxLeft = Math.max(rect.left, rect.right - targetWidth);
        const maxTop = Math.max(rect.top, rect.bottom - targetHeight);
        const clampedLeft = Math.min(Math.max(rawLeft, rect.left), maxLeft);
        const clampedTop = Math.min(Math.max(rawTop, rect.top), maxTop);

        this.domRoot.style.left = `${clampedLeft}px`;
        this.domRoot.style.top = `${clampedTop}px`;
        this.domRoot.style.width = `${targetWidth}px`;
        this.domRoot.style.height = `${targetHeight}px`;
    }

    private pushDebugEvent(type: string, payload?: Record<string, unknown>): void {
        const targetWindow = window as typeof window & { __timdConversationDebug?: Array<Record<string, unknown>> };
        const entry = {
            type,
            hidden: this.isHidden(),
            time: Date.now(),
            payload: payload ?? null
        };
        if (!Array.isArray(targetWindow.__timdConversationDebug)) {
            targetWindow.__timdConversationDebug = [];
        }
        targetWindow.__timdConversationDebug.push(entry);
        if (targetWindow.__timdConversationDebug.length > 50) {
            targetWindow.__timdConversationDebug.shift();
        }
    }

    private isScrolledToBottom(): boolean {
        if (!this.historyElement) {
            return true;
        }
        const distance = this.historyElement.scrollHeight - this.historyElement.scrollTop - this.historyElement.clientHeight;
        return distance <= 24;
    }

    private formatTime(timestamp: number): string {
        const date = new Date(timestamp);
        return `${this.twoDigits(date.getHours())}:${this.twoDigits(date.getMinutes())}`;
    }

    private twoDigits(value: number): string {
        return value < 10 ? `0${value}` : `${value}`;
    }

    private setGameInputBlocked(blocked: boolean): void {
        const game = this.getScene()?.game;
        if (!game?.keyboard) {
            return;
        }
        if (blocked) {
            game.keyboard.blockInput = this;
            return;
        }
        if (game.keyboard.blockInput === this) {
            game.keyboard.blockInput = undefined;
        }
    }
}
