import { CHAT_STORE_KEY, syncChatStoreFromStorage } from "../state/chat-store";
import { SCENE_STORE_KEY, sceneStore, syncSceneStoreFromStorage } from "../state/scene-store";
import { SETTINGS_KEY, syncSettingsStoreFromStorage } from "../state/settings-store";
import { syncTemplateStoreFromStorage, TEMPLATE_STORE_KEY } from "../state/template-store";
import { syncUIStoreFromStorage, UI_PREFS_KEY } from "../state/ui-store";

export interface PersistedAppSnapshots {
  chatSnapshot: unknown;
  settingsSnapshot: unknown;
  uiPreferences: unknown;
  templatesSnapshot: unknown;
  sceneSnapshot: unknown;
}

const BACKUP_DEVICE_ID_KEY = "geohelper.backup.device_id";

const makeBackupDeviceId = (): string =>
  `device_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;

export const canUseStorage = (): boolean =>
  typeof localStorage !== "undefined" &&
  typeof localStorage.getItem === "function" &&
  typeof localStorage.setItem === "function";

export const parseJsonMaybe = (raw: string | null): unknown => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const asObject = (
  value: unknown
): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

export const readCurrentPersistedAppSnapshots = (): PersistedAppSnapshots => ({
  chatSnapshot: canUseStorage() ? parseJsonMaybe(localStorage.getItem(CHAT_STORE_KEY)) : null,
  settingsSnapshot: canUseStorage()
    ? parseJsonMaybe(localStorage.getItem(SETTINGS_KEY))
    : null,
  uiPreferences: canUseStorage() ? parseJsonMaybe(localStorage.getItem(UI_PREFS_KEY)) : null,
  templatesSnapshot: canUseStorage()
    ? parseJsonMaybe(localStorage.getItem(TEMPLATE_STORE_KEY))
    : null,
  sceneSnapshot: canUseStorage() ? parseJsonMaybe(localStorage.getItem(SCENE_STORE_KEY)) : null
});

export const syncLiveStoresAfterImport = async (): Promise<void> => {
  syncChatStoreFromStorage();
  syncSettingsStoreFromStorage();
  syncUIStoreFromStorage();
  syncTemplateStoreFromStorage();
  syncSceneStoreFromStorage();
  await sceneStore.getState().rehydrateScene();
};

export const getOrCreateBackupDeviceId = (): string => {
  if (!canUseStorage()) {
    return "device_local";
  }

  const existing = localStorage.getItem(BACKUP_DEVICE_ID_KEY)?.trim();
  if (existing) {
    return existing;
  }

  const next = makeBackupDeviceId();
  localStorage.setItem(BACKUP_DEVICE_ID_KEY, next);
  return next;
};
