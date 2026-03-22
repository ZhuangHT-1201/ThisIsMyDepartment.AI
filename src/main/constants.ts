/** Width of the game in pixels. */
export const GAME_WIDTH = 384;

/** Height of the game in pixels. */
export const GAME_HEIGHT = 216;

/** Fonts */
export const STANDARD_FONT = "fonts/pixcelsior.font.json";
export const HEADLINE_FONT = "fonts/headline.font.json";
export const SMALL_FONT = "fonts/smallFont.font.json";

/** Default shared room identifiers */
export const DEFAULT_DEV_ROOM_NAME = "timd-dev-room";
export const DEFAULT_SHARED_ROOM_NAME = "thisismydepartment-main";

export const MEDIA_DEVICE_STORAGE_KEYS = {
    audioInput: "timdDefaultAudioInput",
    videoInput: "timdDefaultVideoInput",
    audioOutput: "timdDefaultAudioOutput"
} as const;

export const LEGACY_MEDIA_DEVICE_STORAGE_KEYS = {
    audioInput: "gatherDefaultAudioSrc",
    videoInput: "gatherDefaultVideoSrc",
    audioOutput: "gatherDefaultAudioOutput"
} as const;

type MediaDevicePreferenceKey = keyof typeof MEDIA_DEVICE_STORAGE_KEYS;

export const getStoredMediaDevicePreference = (storage: Storage, key: MediaDevicePreferenceKey): string | undefined => {
    return storage.getItem(MEDIA_DEVICE_STORAGE_KEYS[key])
        ?? storage.getItem(LEGACY_MEDIA_DEVICE_STORAGE_KEYS[key])
        ?? undefined;
};

export const setStoredMediaDevicePreference = (storage: Storage, key: MediaDevicePreferenceKey, value: string): void => {
    storage.setItem(MEDIA_DEVICE_STORAGE_KEYS[key], value);
    storage.removeItem(LEGACY_MEDIA_DEVICE_STORAGE_KEYS[key]);
};

/** Gravity in m/s² */
export const GRAVITY = 35;

/** Layers */
export enum Layer {
    BACKGROUND = 0,
    DEFAULT = 1,
    FOREGROUND = 2,
    LIGHT = 3,
    OVERLAY = 4,
    DIALOG = 5,
    HUD = 6
}
