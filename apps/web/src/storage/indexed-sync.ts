const CHAT_STORE_KEY = "geohelper.chat.snapshot";
const SETTINGS_KEY = "geohelper.settings.snapshot";
const UI_PREFS_KEY = "geohelper.ui.preferences";
const SCENE_STORE_KEY = "geohelper.scene.snapshot";
const DB_CHAT_SNAPSHOT_KEY = "snapshot.chat";
const DB_SETTINGS_SNAPSHOT_KEY = "snapshot.settings";
const DB_UI_PREFS_KEY = "snapshot.ui";
const DB_SCENE_SNAPSHOT_KEY = "snapshot.scene";

const canUseStorage = (): boolean =>
  typeof localStorage !== "undefined" &&
  typeof localStorage.getItem === "function" &&
  typeof localStorage.setItem === "function";

const canUseIndexedDb = (): boolean => typeof indexedDB !== "undefined";

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const parseJsonMaybe = (raw: string | null): Record<string, unknown> | null => {
  if (!raw) {
    return null;
  }

  try {
    return asObject(JSON.parse(raw));
  } catch {
    return null;
  }
};

const withDb = async <T>(
  runner: (db: {
    settings: {
      get: (key: string) => Promise<{ value: unknown } | undefined>;
      put: (entry: { key: string; value: unknown; updatedAt: string }) => Promise<void>;
    };
  }) => Promise<T>
): Promise<T | undefined> => {
  if (!canUseIndexedDb()) {
    return undefined;
  }

  try {
    const { db } = await import("./db");
    return await runner(db);
  } catch {
    return undefined;
  }
};

const readDbSnapshot = async (
  key: string
): Promise<Record<string, unknown> | null> => {
  const record = await withDb((db) => db.settings.get(key));
  return asObject(record?.value);
};

const writeDbSnapshot = async (
  key: string,
  value: Record<string, unknown>
): Promise<void> => {
  await withDb((db) =>
    db.settings.put({
      key,
      value,
      updatedAt: new Date().toISOString()
    })
  );
};

const readLocalSnapshot = (
  key: string
): Record<string, unknown> | null => parseJsonMaybe(localStorage.getItem(key));

const writeLocalSnapshot = (
  key: string,
  value: Record<string, unknown>
): void => {
  localStorage.setItem(key, JSON.stringify(value));
};

const hasAnyLocalSnapshot = (): boolean =>
  Boolean(
    localStorage.getItem(CHAT_STORE_KEY) ||
      localStorage.getItem(SETTINGS_KEY) ||
      localStorage.getItem(UI_PREFS_KEY) ||
      localStorage.getItem(SCENE_STORE_KEY)
  );

export const syncLocalSnapshotsWithIndexedDb = async (): Promise<void> => {
  if (!canUseStorage()) {
    return;
  }

  // If local snapshots exist, treat them as source of truth for this startup
  // and mirror to IndexedDB so future reloads can recover when localStorage is cleared.
  if (hasAnyLocalSnapshot()) {
    const chat = readLocalSnapshot(CHAT_STORE_KEY);
    const settings = readLocalSnapshot(SETTINGS_KEY);
    const ui = readLocalSnapshot(UI_PREFS_KEY);
    const scene = readLocalSnapshot(SCENE_STORE_KEY);

    if (chat) {
      await writeDbSnapshot(DB_CHAT_SNAPSHOT_KEY, chat);
    }
    if (settings) {
      await writeDbSnapshot(DB_SETTINGS_SNAPSHOT_KEY, settings);
    }
    if (ui) {
      await writeDbSnapshot(DB_UI_PREFS_KEY, ui);
    }
    if (scene) {
      await writeDbSnapshot(DB_SCENE_SNAPSHOT_KEY, scene);
    }
    return;
  }

  const [chatFromDb, settingsFromDb, uiFromDb, sceneFromDb] = await Promise.all([
    readDbSnapshot(DB_CHAT_SNAPSHOT_KEY),
    readDbSnapshot(DB_SETTINGS_SNAPSHOT_KEY),
    readDbSnapshot(DB_UI_PREFS_KEY),
    readDbSnapshot(DB_SCENE_SNAPSHOT_KEY)
  ]);

  if (chatFromDb) {
    writeLocalSnapshot(CHAT_STORE_KEY, chatFromDb);
  }
  if (settingsFromDb) {
    writeLocalSnapshot(SETTINGS_KEY, settingsFromDb);
  }
  if (uiFromDb) {
    writeLocalSnapshot(UI_PREFS_KEY, uiFromDb);
  }
  if (sceneFromDb) {
    writeLocalSnapshot(SCENE_STORE_KEY, sceneFromDb);
  }
};

export const persistChatSnapshotToIndexedDb = async (
  snapshot: Record<string, unknown>
): Promise<void> => {
  if (!snapshot || !canUseIndexedDb()) {
    return;
  }
  await writeDbSnapshot(DB_CHAT_SNAPSHOT_KEY, snapshot);
};

export const persistSettingsSnapshotToIndexedDb = async (
  snapshot: Record<string, unknown>
): Promise<void> => {
  if (!snapshot || !canUseIndexedDb()) {
    return;
  }
  await writeDbSnapshot(DB_SETTINGS_SNAPSHOT_KEY, snapshot);
};

export const persistUiPrefsToIndexedDb = async (
  snapshot: Record<string, unknown>
): Promise<void> => {
  if (!snapshot || !canUseIndexedDb()) {
    return;
  }
  await writeDbSnapshot(DB_UI_PREFS_KEY, snapshot);
};

export const persistSceneSnapshotToIndexedDb = async (
  snapshot: Record<string, unknown>
): Promise<void> => {
  if (!snapshot || !canUseIndexedDb()) {
    return;
  }
  await writeDbSnapshot(DB_SCENE_SNAPSHOT_KEY, snapshot);
};
