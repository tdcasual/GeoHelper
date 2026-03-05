const CHAT_STORE_KEY = "geohelper.chat.snapshot";
const SETTINGS_KEY = "geohelper.settings.snapshot";
const UI_PREFS_KEY = "geohelper.ui.preferences";
const SCENE_STORE_KEY = "geohelper.scene.snapshot";
const TEMPLATE_STORE_KEY = "geohelper.templates.snapshot";
const DB_CHAT_SNAPSHOT_KEY = "snapshot.chat";
const DB_SETTINGS_SNAPSHOT_KEY = "snapshot.settings";
const DB_UI_PREFS_KEY = "snapshot.ui";
const DB_SCENE_SNAPSHOT_KEY = "snapshot.scene";
const DB_TEMPLATE_SNAPSHOT_KEY = "snapshot.templates";

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

interface DbSettingRecord {
  key: string;
  value: unknown;
  updatedAt?: string;
}

const withDb = async <T>(
  runner: (db: {
    settings: {
      get: (key: string) => Promise<DbSettingRecord | undefined>;
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

const readDbSnapshotRecord = async (
  key: string
): Promise<DbSettingRecord | undefined> => withDb((db) => db.settings.get(key));

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

export const syncLocalSnapshotsWithIndexedDb = async (): Promise<void> => {
  if (!canUseStorage()) {
    return;
  }

  const keyMappings = [
    { local: CHAT_STORE_KEY, db: DB_CHAT_SNAPSHOT_KEY },
    { local: SETTINGS_KEY, db: DB_SETTINGS_SNAPSHOT_KEY },
    { local: UI_PREFS_KEY, db: DB_UI_PREFS_KEY },
    { local: SCENE_STORE_KEY, db: DB_SCENE_SNAPSHOT_KEY },
    { local: TEMPLATE_STORE_KEY, db: DB_TEMPLATE_SNAPSHOT_KEY }
  ];

  for (const mapping of keyMappings) {
    const [dbRecord, localSnapshot] = await Promise.all([
      readDbSnapshotRecord(mapping.db),
      Promise.resolve(readLocalSnapshot(mapping.local))
    ]);
    const dbSnapshot = asObject(dbRecord?.value);

    // IndexedDB is source of truth. If missing, backfill from local snapshot.
    if (dbSnapshot) {
      writeLocalSnapshot(mapping.local, dbSnapshot);
      continue;
    }
    if (localSnapshot) {
      await writeDbSnapshot(mapping.db, localSnapshot);
    }
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

export const persistTemplatesSnapshotToIndexedDb = async (
  snapshot: Record<string, unknown>
): Promise<void> => {
  if (!snapshot || !canUseIndexedDb()) {
    return;
  }
  await writeDbSnapshot(DB_TEMPLATE_SNAPSHOT_KEY, snapshot);
};
