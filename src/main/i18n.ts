import type { CurrentUserProfile } from "./types/currentUser";

export type AppLanguage = "en" | "zh";

export const DEFAULT_LANGUAGE: AppLanguage = "en";

const LANGUAGE_PREFERENCE_STORAGE_KEY = "timd.language";

const UI_FONT_STACKS: Record<AppLanguage, string> = {
    en: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif",
    zh: "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Source Han Sans SC', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif"
};

const CODE_FONT_STACKS: Record<AppLanguage, string> = {
    en: "'SFMono-Regular', 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace",
    zh: "'SFMono-Regular', 'SF Mono', Consolas, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans Mono CJK SC', monospace"
};

const TRANSLATIONS: Record<AppLanguage, Record<string, string>> = {
    en: {
        "common.close": "Close",
        "common.save": "Save",
        "common.cancel": "Cancel",
        "common.clear": "Clear",
        "common.default": "Default",
        "common.language": "Language",
        "language.option.en": "English",
        "language.option.zh": "Chinese",

        "settings.sidebarTitle": "Settings",
        "settings.sidebarSubtitle": "Manage media devices, language, avatar appearance, and your offline AI behavior in one place.",
        "settings.tab.media": "Media",
        "settings.tab.language": "Language",
        "settings.tab.character": "Character",
        "settings.tab.aiPrompt": "AI Prompt",
        "settings.description.media": "Choose microphone, speaker, and camera devices using normal form controls.",
        "settings.description.language": "Choose the interface language used for prompts, labels, and app overlays.",
        "settings.description.character": "Update your avatar appearance without waiting for first-time login.",
        "settings.description.aiPrompt": "Edit the prompt used when your own character is AI-controlled while you are offline.",
        "settings.media.intro": "Turn on the microphone or camera here first. Device selectors stay hidden until the corresponding device is enabled, so the browser only asks for permission after an explicit user action.",
        "settings.media.loading": "Loading media devices...",
        "settings.media.refresh": "Refresh device list",
        "settings.media.loadFailed": "Media device loading failed.",
        "settings.media.noDevices": "No devices available",
        "settings.media.noAudioOutputSupport": "This browser does not support selecting speaker output devices.",
        "settings.media.toggle.on": "Turn On",
        "settings.media.toggle.off": "Turn Off",
        "settings.media.enabling": "Enabling {device}...",
        "settings.media.disabling": "Disabling {device}...",
        "settings.media.enabled": "{device} enabled.",
        "settings.media.disabled": "{device} disabled.",
        "settings.media.toggleFailed": "{device} toggle failed.",
        "settings.media.applying": "Applying {device}...",
        "settings.media.updated": "{device} updated.",
        "settings.media.updateFailed": "{device} update failed.",
        "settings.media.audioinput": "Microphone",
        "settings.media.audiooutput": "Speaker",
        "settings.media.videoinput": "Camera",
        "settings.media.hidden.audioinput": "Turn on the microphone to choose an input device.",
        "settings.media.hidden.videoinput": "Turn on the camera to choose a device.",
        "settings.media.helper.enable.audioinput": "Enable the microphone here before selecting a microphone device.",
        "settings.media.helper.enable.videoinput": "Enable the camera here before selecting a camera device.",
        "settings.media.helper.enabled": "You can now choose the {device} used for this room.",
        "settings.media.helper.audiooutput": "Speaker output support depends on the browser.",
        "settings.media.helper.audiooutputUnsupported": "Safari and some other browsers do not expose selectable speaker output devices. Audio still plays through the system output device.",
        "settings.media.helper.default": "Select the {device} used for this room.",
        "settings.language.intro": "Choose whether the interface uses English or Chinese. Changes apply immediately after saving.",
        "settings.language.label": "Interface language",
        "settings.language.helper": "This affects the settings UI, conversation overlays, interaction prompts, and localized iframe labels when available.",
        "settings.language.save": "Save language",
        "settings.language.saving": "Saving language...",
        "settings.language.saved": "Language updated.",
        "settings.language.failed": "Language update failed.",
        "settings.character.intro": "Pick a character appearance and save it. The change is stored in your profile and applied in the room immediately.",
        "settings.character.avatar": "Avatar {index}",
        "settings.character.save": "Save avatar",
        "settings.character.saving": "Saving avatar...",
        "settings.character.saved": "Avatar updated.",
        "settings.character.failed": "Avatar update failed.",
        "settings.prompt.intro": "This prompt controls how your own character behaves when the system needs to act for you while you are offline.",
        "settings.prompt.placeholder": "Describe how your character should speak, help others, use prior context, and behave when AI-controlled.",
        "settings.prompt.clear": "Clear prompt",
        "settings.prompt.save": "Save prompt",
        "settings.prompt.saving": "Saving prompt...",
        "settings.prompt.saved": "Prompt updated.",
        "settings.prompt.cleared": "Prompt cleared.",
        "settings.prompt.failed": "Prompt save failed.",

        "conversation.mode.agent": "AI character",
        "conversation.mode.player": "Direct conversation",
        "conversation.title.default": "Conversation",
        "conversation.close": "Close",
        "conversation.empty": "No messages yet. Start the conversation here.",
        "conversation.sender.you": "You",
        "conversation.sender.ai": "AI",
        "conversation.placeholder.agent": "Ask {name} something...",
        "conversation.placeholder.player": "Message {name}...",
        "conversation.submit.send": "Send",
        "conversation.submit.waiting": "Waiting...",
        "conversation.status.default": "Enter to send. Shift+Enter for newline.",
        "conversation.status.replying": "{name} is replying...",
        "conversation.status.playerInactive": "Conversation is visible, but sending stays disabled until the live chat is active.",

        "interaction.hint.single": "Press {key} to {action}",
        "interaction.hint.multiple": "Press {key} to choose nearby interaction ({count})",
        "interaction.chooser.title": "{count} nearby interactions",
        "interaction.chooser.help": "Use W/S or arrow keys to choose. Press E or Enter to confirm. Press Q or Esc to cancel.",
        "interaction.action.chatWith": "chat with {name}",
        "interaction.action.open": "open {name}",
        "interaction.action.sit": "sit down",
        "interaction.action.start": "start {name}",
        "interaction.action.talkTo": "talk to {name}",
        "interaction.action.interactWith": "interact with {name}",
        "interaction.caption.open": "Press {key} to open",
        "interaction.subtitle.player": "Player",
        "interaction.subtitle.ai": "AI character",
        "interaction.subtitle.iframe": "Embedded page",
        "interaction.subtitle.chair": "Seat",
        "interaction.subtitle.presentation": "Presentation",
        "interaction.subtitle.tool": "Interactive tool",
        "interaction.subtitle.character": "Character",
        "interaction.subtitle.object": "Object",
        "presentation.controls.title": "Presentation Controls",
        "presentation.controls.subtitle": "Share your real screen, manage audience audio, and monitor who is currently watching.",
        "presentation.controls.share.start": "Start Screen Share",
        "presentation.controls.share.stop": "Stop Screen Share",
        "presentation.controls.muteAll": "Mute Audience",
        "presentation.controls.requestUnmuteAll": "Ask Audience to Unmute",
        "presentation.controls.audience": "Audience ({count})",
        "presentation.controls.audienceEmpty": "Nobody else is in the room yet.",
        "presentation.controls.audienceAudioMuted": "Mic muted",
        "presentation.controls.audienceAudioLive": "Mic live",
        "presentation.controls.audienceVideoMuted": "Cam off",
        "presentation.controls.audienceVideoLive": "Cam on",
        "presentation.controls.moderatorRequired": "Bulk muting requires moderator permissions in the current room.",
        "presentation.controls.status.ready": "Presenter controls are ready.",
        "presentation.controls.status.sharing": "Opening the browser screen-share picker...",
        "presentation.controls.status.muting": "Muting audience microphones...",
        "presentation.controls.notifications.mutedAudience": "Muted {count} audience members.",
        "presentation.controls.notifications.requestSent": "Sent an unmute request to {count} audience members.",
        "presentation.controls.notifications.requestedUnmute": "{name} asked the audience to unmute when ready.",
        "presentation.controls.errors.mediaUnavailable": "Live media controls are not ready yet.",
        "presentation.controls.errors.localJitsiDisabled": "Screen sharing is disabled on localhost until TIMD_JITSI_* is configured in the frontend runtime.",
        "presentation.controls.errors.jitsiInitTimeout": "Jitsi did not become ready in time. Check the configured Jitsi endpoint and browser console.",
        "presentation.controls.errors.jitsiInitFailed": "Jitsi initialization failed: {message}",
        "presentation.controls.errors.moderatorRequired": "You need moderator permissions to mute the audience.",
        "interaction.fallback.sharedPage": "shared page",
        "interaction.fallback.seat": "seat",
        "interaction.fallback.presentation": "presentation",
        "interaction.fallback.board": "board",
        "interaction.fallback.npc": "NPC",
        "interaction.fallback.object": "object",

        "status.chatsUsers": "Chats with Users",
        "status.chatsAi": "Chats with AI",
        "status.appUsage": "App Usage Time (min)",
        "status.role": "Role",
        "status.affiliation": "Affiliation",
        "status.userId": "User ID",
        "status.defaultAffiliation": "Unassigned",
        "status.defaultRole": "Member",
        "status.guest": "Guest",
        "status.unavailable": "Unavailable",
        "status.roomReady": "Room Ready",
        "status.joiningRoom": "Joining Room",
        "status.starting": "Starting",
        "status.action.character": "Character",
        "status.action.settings": "Settings",
        "status.action.settingsAlt": "Settings",
        "status.audio.on": "Mic On",
        "status.audio.off": "Mic Off",
        "status.video.on": "Cam On",
        "status.video.off": "Cam Off",

        "profile.avatarSaved": "Avatar updated.",
        "profile.promptSaved": "Character AI prompt saved.",
        "profile.promptCleared": "Character AI prompt cleared.",

        "navigator.title": "Directory",
        "navigator.subtitle": "",
        "navigator.tab.rooms": "Rooms",
        "navigator.tab.avatars": "Avatars",
        "navigator.rooms.title": "Rooms",
        "navigator.rooms.subtitle": "Jump directly to a labeled room in the current scene.",
        "navigator.rooms.empty": "No named rooms were found in the current map.",
        "navigator.rooms.teleport": "Teleport",
        "navigator.rooms.teleported": "Teleported to {name}.",
        "navigator.rooms.locationHint": "Scene room",
        "navigator.avatars.title": "Avatar Directory",
        "navigator.avatars.subtitle": "Summon one shared AI avatar at a time in front of the elevator.",
        "navigator.avatars.refresh": "Refresh",
        "navigator.avatars.loading": "Loading...",
        "navigator.avatars.empty": "No saved user avatars are available yet.",
        "navigator.avatars.active": "Your active avatar: {name}",
        "navigator.avatars.noneActive": "You do not currently have an active summoned avatar.",
        "navigator.avatars.spawn": "Summon",
        "navigator.avatars.spawning": "Summoning...",
        "navigator.avatars.spawned": "Summoned {name} into the scene.",
        "navigator.avatars.spawnFailed": "AI character summon failed.",
        "navigator.avatars.spawnOnlineBlocked": "{name} is currently online and cannot be summoned as an AI character.",
        "navigator.avatars.unavailable": "No Avatar",
        "navigator.avatars.statusActive": "Summoned in room",
        "navigator.avatars.statusOnline": "Currently online",
        "navigator.avatars.statusPromptConfigured": "Custom AI prompt",
        "navigator.avatars.loadFailed": "User directory could not be loaded.",
        "navigator.avatars.caption": "Press E to chat",

        "iframe.paste.placeholder": "Paste code here",

        "device.fallback.audioinput": "Microphone {index}",
        "device.fallback.audiooutput": "Speaker {index}",
        "device.fallback.videoinput": "Camera {index}"
    },
    zh: {
        "common.close": "关闭",
        "common.save": "保存",
        "common.cancel": "取消",
        "common.clear": "清空",
        "common.default": "默认",
        "common.language": "语言",
        "language.option.en": "English",
        "language.option.zh": "中文",

        "settings.sidebarTitle": "设置",
        "settings.sidebarSubtitle": "在这里统一管理媒体设备、语言、角色外观，以及你离线时的 AI 行为。",
        "settings.tab.media": "媒体",
        "settings.tab.language": "语言",
        "settings.tab.character": "角色",
        "settings.tab.aiPrompt": "AI 提示词",
        "settings.description.media": "使用常规表单控件选择麦克风、扬声器和摄像头设备。",
        "settings.description.language": "选择界面使用英文还是中文，包括提示、标签和应用覆盖层。",
        "settings.description.character": "无需等待首次登录流程，也可以更新你的角色外观。",
        "settings.description.aiPrompt": "编辑当你离线时，系统接管你的角色所使用的提示词。",
        "settings.media.intro": "请先在这里打开麦克风或摄像头。对应设备启用之前，设备选择器会保持隐藏，这样浏览器只会在用户明确操作后再请求权限。",
        "settings.media.loading": "正在加载媒体设备...",
        "settings.media.refresh": "刷新设备列表",
        "settings.media.loadFailed": "媒体设备加载失败。",
        "settings.media.noDevices": "没有可用设备",
        "settings.media.noAudioOutputSupport": "当前浏览器不支持选择扬声器输出设备。",
        "settings.media.toggle.on": "打开",
        "settings.media.toggle.off": "关闭",
        "settings.media.enabling": "正在启用{device}...",
        "settings.media.disabling": "正在关闭{device}...",
        "settings.media.enabled": "{device}已启用。",
        "settings.media.disabled": "{device}已关闭。",
        "settings.media.toggleFailed": "{device}切换失败。",
        "settings.media.applying": "正在应用{device}...",
        "settings.media.updated": "{device}已更新。",
        "settings.media.updateFailed": "{device}更新失败。",
        "settings.media.audioinput": "麦克风",
        "settings.media.audiooutput": "扬声器",
        "settings.media.videoinput": "摄像头",
        "settings.media.hidden.audioinput": "请先打开麦克风，再选择输入设备。",
        "settings.media.hidden.videoinput": "请先打开摄像头，再选择设备。",
        "settings.media.helper.enable.audioinput": "请先在这里启用麦克风，然后再选择麦克风设备。",
        "settings.media.helper.enable.videoinput": "请先在这里启用摄像头，然后再选择摄像头设备。",
        "settings.media.helper.enabled": "现在可以选择此房间使用的{device}。",
        "settings.media.helper.audiooutput": "扬声器输出是否可选取决于浏览器支持。",
        "settings.media.helper.audiooutputUnsupported": "Safari 和部分浏览器不会提供可切换的扬声器输出设备列表，音频仍会通过系统当前输出设备播放。",
        "settings.media.helper.default": "选择此房间使用的{device}。",
        "settings.language.intro": "选择界面使用英文还是中文。保存后会立即生效。",
        "settings.language.label": "界面语言",
        "settings.language.helper": "这会影响设置界面、对话窗口、交互提示，以及在可用时的 iframe 本地化标签。",
        "settings.language.save": "保存语言",
        "settings.language.saving": "正在保存语言...",
        "settings.language.saved": "语言已更新。",
        "settings.language.failed": "语言更新失败。",
        "settings.character.intro": "选择一个角色外观并保存。更改会写入你的个人资料，并立即在房间中生效。",
        "settings.character.avatar": "角色 {index}",
        "settings.character.save": "保存外观",
        "settings.character.saving": "正在保存外观...",
        "settings.character.saved": "角色外观已更新。",
        "settings.character.failed": "角色外观更新失败。",
        "settings.prompt.intro": "当你离线时，如果系统需要代替你行动，这段提示词会控制你自己的角色如何表现。",
        "settings.prompt.placeholder": "描述你的角色在 AI 接管时应如何说话、帮助他人、利用已有上下文，以及整体行为方式。",
        "settings.prompt.clear": "清空提示词",
        "settings.prompt.save": "保存提示词",
        "settings.prompt.saving": "正在保存提示词...",
        "settings.prompt.saved": "提示词已更新。",
        "settings.prompt.cleared": "提示词已清空。",
        "settings.prompt.failed": "提示词保存失败。",

        "conversation.mode.agent": "AI 角色",
        "conversation.mode.player": "直接对话",
        "conversation.title.default": "对话",
        "conversation.close": "关闭",
        "conversation.empty": "还没有消息，从这里开始对话。",
        "conversation.sender.you": "你",
        "conversation.sender.ai": "AI",
        "conversation.placeholder.agent": "向{name}提问...",
        "conversation.placeholder.player": "给{name}发送消息...",
        "conversation.submit.send": "发送",
        "conversation.submit.waiting": "等待中...",
        "conversation.status.default": "按 Enter 发送，Shift+Enter 换行。",
        "conversation.status.replying": "{name}正在回复...",
        "conversation.status.playerInactive": "对话窗口仍可见，但只有实时聊天处于激活状态时才能发送消息。",

        "interaction.hint.single": "按{key}键{action}",
        "interaction.hint.multiple": "按{key}键选择附近可交互对象（{count}）",
        "interaction.chooser.title": "附近有 {count} 个可交互对象",
        "interaction.chooser.help": "使用 W/S 或方向键选择，按 E 或 Enter 确认，按 Q 或 Esc 取消。",
        "interaction.action.chatWith": "与{name}聊天",
        "interaction.action.open": "打开{name}",
        "interaction.action.sit": "坐下",
        "interaction.action.start": "开始{name}",
        "interaction.action.talkTo": "与{name}交谈",
        "interaction.action.interactWith": "与{name}互动",
        "interaction.caption.open": "按{key}键打开",
        "interaction.subtitle.player": "其他用户",
        "interaction.subtitle.ai": "AI 角色",
        "interaction.subtitle.iframe": "嵌入页面",
        "interaction.subtitle.chair": "座位",
        "interaction.subtitle.presentation": "演示",
        "interaction.subtitle.tool": "互动工具",
        "interaction.subtitle.character": "角色",
        "interaction.subtitle.object": "对象",
        "presentation.controls.title": "演示控制",
        "presentation.controls.subtitle": "分享你的真实屏幕、统一管理观众音频，并查看当前观众名单。",
        "presentation.controls.share.start": "开始共享屏幕",
        "presentation.controls.share.stop": "停止共享屏幕",
        "presentation.controls.muteAll": "全部静音",
        "presentation.controls.requestUnmuteAll": "请求全部取消静音",
        "presentation.controls.audience": "当前观众（{count}）",
        "presentation.controls.audienceEmpty": "目前房间里还没有其他观众。",
        "presentation.controls.audienceAudioMuted": "麦克风已静音",
        "presentation.controls.audienceAudioLive": "麦克风开启",
        "presentation.controls.audienceVideoMuted": "摄像头关闭",
        "presentation.controls.audienceVideoLive": "摄像头开启",
        "presentation.controls.moderatorRequired": "批量静音需要当前房间的主持人权限。",
        "presentation.controls.status.ready": "演示控制已就绪。",
        "presentation.controls.status.sharing": "正在打开浏览器的屏幕共享选择器...",
        "presentation.controls.status.muting": "正在静音观众麦克风...",
        "presentation.controls.notifications.mutedAudience": "已静音 {count} 位观众。",
        "presentation.controls.notifications.requestSent": "已向 {count} 位观众发送取消静音请求。",
        "presentation.controls.notifications.requestedUnmute": "{name} 请求观众在准备好后取消静音。",
        "presentation.controls.errors.mediaUnavailable": "实时媒体控制尚未准备好。",
        "presentation.controls.errors.localJitsiDisabled": "当前在 localhost 下未配置 TIMD_JITSI_*，因此屏幕共享已禁用。",
        "presentation.controls.errors.jitsiInitTimeout": "Jitsi 在预期时间内没有准备好。请检查配置的 Jitsi 地址和浏览器控制台。",
        "presentation.controls.errors.jitsiInitFailed": "Jitsi 初始化失败：{message}",
        "presentation.controls.errors.moderatorRequired": "你需要主持人权限才能统一静音观众。",
        "interaction.fallback.sharedPage": "共享页面",
        "interaction.fallback.seat": "座位",
        "interaction.fallback.presentation": "演示",
        "interaction.fallback.board": "白板",
        "interaction.fallback.npc": "角色",
        "interaction.fallback.object": "对象",

        "status.chatsUsers": "与用户聊天次数",
        "status.chatsAi": "与 AI 聊天次数",
        "status.appUsage": "应用使用时长（分钟）",
        "status.role": "身份",
        "status.affiliation": "归属",
        "status.userId": "用户 ID",
        "status.defaultAffiliation": "未分配",
        "status.defaultRole": "成员",
        "status.guest": "访客",
        "status.unavailable": "不可用",
        "status.roomReady": "房间已就绪",
        "status.joiningRoom": "正在加入房间",
        "status.starting": "启动中",
        "status.action.character": "角色",
        "status.action.settings": "设置",
        "status.action.settingsAlt": "设置",
        "status.audio.on": "麦克风开",
        "status.audio.off": "麦克风关",
        "status.video.on": "摄像头开",
        "status.video.off": "摄像头关",

        "profile.avatarSaved": "角色外观已更新。",
        "profile.promptSaved": "角色 AI 提示词已保存。",
        "profile.promptCleared": "角色 AI 提示词已清空。",

        "navigator.title": "导航面板",
        "navigator.subtitle": "",
        "navigator.tab.rooms": "房间",
        "navigator.tab.avatars": "角色",
        "navigator.rooms.title": "房间列表",
        "navigator.rooms.subtitle": "直接跳转到当前场景里带标签的房间。",
        "navigator.rooms.empty": "当前地图里没有找到已命名房间。",
        "navigator.rooms.teleport": "传送",
        "navigator.rooms.teleported": "已传送到{name}。",
        "navigator.rooms.locationHint": "场景房间",
        "navigator.avatars.title": "角色目录",
        "navigator.avatars.subtitle": "一次只能召唤一个共享 AI 角色，召唤位置在电梯前。",
        "navigator.avatars.refresh": "刷新",
        "navigator.avatars.loading": "加载中...",
        "navigator.avatars.empty": "目前还没有可用的已保存角色。",
        "navigator.avatars.active": "你当前激活的角色：{name}",
        "navigator.avatars.noneActive": "你当前没有激活的已召唤角色。",
        "navigator.avatars.spawn": "召唤",
        "navigator.avatars.spawning": "召唤中...",
        "navigator.avatars.spawned": "已在场景中召唤{name}。",
        "navigator.avatars.spawnFailed": "AI 角色召唤失败。",
        "navigator.avatars.spawnOnlineBlocked": "{name} 当前在线，不能召唤其 AI 角色。",
        "navigator.avatars.unavailable": "未设置角色",
        "navigator.avatars.statusActive": "当前已被召唤到房间中",
        "navigator.avatars.statusOnline": "当前在线",
        "navigator.avatars.statusPromptConfigured": "已配置自定义 AI 提示词",
        "navigator.avatars.loadFailed": "用户目录加载失败。",
        "navigator.avatars.caption": "按 E 键聊天",

        "iframe.paste.placeholder": "在此粘贴代码",

        "device.fallback.audioinput": "麦克风 {index}",
        "device.fallback.audiooutput": "扬声器 {index}",
        "device.fallback.videoinput": "摄像头 {index}"
    }
};

export const normalizeLanguage = (value: unknown): AppLanguage => {
    if (typeof value !== "string") {
        return DEFAULT_LANGUAGE;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "zh" || normalized === "zh-cn" || normalized === "zh_hans" || normalized === "chinese") {
        return "zh";
    }
    return "en";
};

export const loadStoredLanguagePreference = (): AppLanguage | null => {
    try {
        const stored = window.localStorage?.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY);
        if (!stored) {
            return null;
        }
        return normalizeLanguage(stored);
    } catch (_error) {
        return null;
    }
};

export const storeLanguagePreference = (language: AppLanguage): void => {
    try {
        window.localStorage?.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, language);
    } catch (_error) {
        // Ignore storage failures so language switching still works for the current session.
    }
};

export const getLanguagePreference = (profile: CurrentUserProfile | null | undefined): AppLanguage => {
    const profilePreference = profile?.preferences?.language;
    if (typeof profilePreference === "string" && profilePreference.trim().length > 0) {
        return normalizeLanguage(profilePreference);
    }
    return loadStoredLanguagePreference() ?? DEFAULT_LANGUAGE;
};

export const translate = (language: AppLanguage, key: string, params?: Record<string, string | number>): string => {
    const template = TRANSLATIONS[language][key] ?? TRANSLATIONS.en[key] ?? key;
    if (!params) {
        return template;
    }
    return Object.keys(params).reduce((result, parameterKey) => {
        return result.replace(new RegExp(`\\{${parameterKey}\\}`, "g"), String(params[parameterKey]));
    }, template);
};

export const getUiFontStack = (language: AppLanguage): string => UI_FONT_STACKS[language];

export const getCodeFontStack = (language: AppLanguage): string => CODE_FONT_STACKS[language];

export const getCanvasUiFontStack = (): string => "'SF Pro Text', 'Helvetica Neue', Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif";

export const applyLanguageToDocument = (language: AppLanguage): void => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.language = language;
    document.documentElement.style.setProperty("--timd-ui-font", getUiFontStack(language));
    document.documentElement.style.setProperty("--timd-code-font", getCodeFontStack(language));
};

const getOptionalStringProperty = (tiledObject: any, propertyName: string): string | undefined => {
    const property = tiledObject?.getOptionalProperty?.(propertyName, "string")?.getValue?.();
    if (typeof property !== "string") {
        return undefined;
    }
    const normalized = property.trim();
    return normalized.length > 0 ? normalized : undefined;
};

export const readLocalizedTiledText = (tiledObject: any, baseName: string, fallbackText = ""): Partial<Record<AppLanguage, string>> => {
    const english = getOptionalStringProperty(tiledObject, `${baseName}En`)
        ?? getOptionalStringProperty(tiledObject, `${baseName}_en`)
        ?? getOptionalStringProperty(tiledObject, `${baseName}EN`);
    const chinese = getOptionalStringProperty(tiledObject, `${baseName}Zh`)
        ?? getOptionalStringProperty(tiledObject, `${baseName}_zh`)
        ?? getOptionalStringProperty(tiledObject, `${baseName}CN`)
        ?? getOptionalStringProperty(tiledObject, `${baseName}ZhCn`);
    const generic = getOptionalStringProperty(tiledObject, baseName)
        ?? (typeof tiledObject?.getName?.() === "string" ? tiledObject.getName().trim() : "")
        ?? fallbackText;

    return {
        en: english ?? generic ?? fallbackText,
        zh: chinese ?? generic ?? fallbackText
    };
};

export const getLocalizedText = (language: AppLanguage, values: Partial<Record<AppLanguage, string>> | undefined, fallback = ""): string => {
    const value = values?.[language] ?? values?.en ?? values?.zh ?? fallback;
    return (value ?? fallback).trim();
};