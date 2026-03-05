export const STORAGE_SCHEMA_VERSION = 1;

const CHAT_STORE_KEY = "geohelper.chat.snapshot";
const SETTINGS_KEY = "geohelper.settings.snapshot";
const UI_PREFS_KEY = "geohelper.ui.preferences";
const TEMPLATE_STORE_KEY = "geohelper.templates.snapshot";
const MIGRATION_VERSION_KEY = "geohelper.storage.migration.version";
const CURRENT_MIGRATION_VERSION = 1;

type JsonReadState =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "value"; value: unknown };

const canUseStorage = (): boolean =>
  typeof localStorage !== "undefined" &&
  typeof localStorage.getItem === "function" &&
  typeof localStorage.setItem === "function";

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const readJsonState = (key: string): JsonReadState => {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return { kind: "missing" };
  }

  try {
    return {
      kind: "value",
      value: JSON.parse(raw)
    };
  } catch {
    return { kind: "invalid" };
  }
};

const writeJson = (key: string, value: unknown): void => {
  localStorage.setItem(key, JSON.stringify(value));
};

const normalizeConversations = (
  value: unknown
): Array<Record<string, unknown> & { id: string; updatedAt: number }> => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      ...item,
      id: String(item.id ?? ""),
      title:
        typeof item.title === "string" && item.title.trim()
          ? item.title
          : "新会话",
      createdAt:
        typeof item.createdAt === "number"
          ? item.createdAt
          : typeof item.updatedAt === "number"
            ? item.updatedAt
            : Date.now(),
      updatedAt:
        typeof item.updatedAt === "number"
          ? item.updatedAt
          : typeof item.createdAt === "number"
            ? item.createdAt
            : Date.now(),
      messages: Array.isArray(item.messages) ? item.messages : []
    }))
    .filter((item) => item.id.length > 0);
};

const normalizePresetList = (
  value: unknown
): Array<Record<string, unknown> & { id: string; updatedAt: number }> => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      ...item,
      id: String(item.id ?? ""),
      updatedAt:
        typeof item.updatedAt === "number" ? item.updatedAt : Date.now()
    }))
    .filter((item) => item.id.length > 0);
};

const migrateChatSnapshot = (source: unknown): Record<string, unknown> | null => {
  const raw = asObject(source);
  if (!raw) {
    return null;
  }

  let conversations = normalizeConversations(raw.conversations);
  if (conversations.length === 0 && Array.isArray(raw.messages)) {
    const now = Date.now();
    conversations = [
      {
        id: `conv_legacy_${now}`,
        title: "新会话",
        createdAt: now,
        updatedAt: now,
        messages: raw.messages
      }
    ];
  }

  const activeConversationId =
    typeof raw.activeConversationId === "string" &&
    conversations.some((item) => item.id === raw.activeConversationId)
      ? raw.activeConversationId
      : conversations[0]?.id ?? null;
  const activeMessages = activeConversationId
    ? (conversations.find((item) => item.id === activeConversationId)?.messages ??
      [])
    : [];

  return {
    mode: raw.mode === "official" ? "official" : "byok",
    sessionToken: typeof raw.sessionToken === "string" ? raw.sessionToken : null,
    conversations,
    activeConversationId,
    messages: Array.isArray(activeMessages) ? activeMessages : [],
    reauthRequired: Boolean(raw.reauthRequired)
  };
};

const migrateSettingsSnapshot = (
  source: unknown
): Record<string, unknown> | null => {
  const raw = asObject(source);
  if (!raw) {
    return null;
  }

  const byokPresets = normalizePresetList(raw.byokPresets);
  const officialPresets = normalizePresetList(raw.officialPresets);
  const defaultByokPresetId =
    typeof raw.defaultByokPresetId === "string" &&
    byokPresets.some((item) => item.id === raw.defaultByokPresetId)
      ? raw.defaultByokPresetId
      : byokPresets[0]?.id;
  const defaultOfficialPresetId =
    typeof raw.defaultOfficialPresetId === "string" &&
    officialPresets.some((item) => item.id === raw.defaultOfficialPresetId)
      ? raw.defaultOfficialPresetId
      : officialPresets[0]?.id;

  return {
    schemaVersion: 2,
    defaultMode: raw.defaultMode === "official" ? "official" : "byok",
    byokPresets,
    officialPresets,
    defaultByokPresetId,
    defaultOfficialPresetId,
    sessionOverrides: asObject(raw.sessionOverrides) ?? {},
    experimentFlags: asObject(raw.experimentFlags) ?? {},
    requestDefaults: asObject(raw.requestDefaults) ?? { retryAttempts: 1 },
    debugEvents: Array.isArray(raw.debugEvents) ? raw.debugEvents : []
  };
};

const migrateUiPreferences = (source: unknown): Record<string, unknown> | null => {
  const raw = asObject(source);
  if (!raw) {
    return null;
  }

  return {
    chatVisible:
      typeof raw.chatVisible === "boolean" ? raw.chatVisible : true
  };
};

const migrateTemplateSnapshot = (source: unknown): Record<string, unknown> | null => {
  const raw = asObject(source);
  if (!raw) {
    return null;
  }

  const templates = Array.isArray(raw.templates)
    ? raw.templates
        .map((item) => asObject(item))
        .filter((item): item is Record<string, unknown> => Boolean(item))
        .map((item) => ({
          id: String(item.id ?? ""),
          title:
            typeof item.title === "string" && item.title.trim()
              ? item.title
              : "未命名模板",
          prompt:
            typeof item.prompt === "string" && item.prompt.trim()
              ? item.prompt
              : "",
          category:
            typeof item.category === "string" && item.category.trim()
              ? item.category
              : "custom",
          updatedAt:
            typeof item.updatedAt === "number" ? item.updatedAt : Date.now()
        }))
        .filter((item) => item.id.length > 0 && item.prompt.length > 0)
    : [];

  return {
    schemaVersion: 1,
    templates
  };
};

const migrateToVersion1 = (): void => {
  const chatState = readJsonState(CHAT_STORE_KEY);
  const settingsState = readJsonState(SETTINGS_KEY);
  const uiState = readJsonState(UI_PREFS_KEY);
  const templateState = readJsonState(TEMPLATE_STORE_KEY);

  if (chatState.kind === "invalid") {
    localStorage.removeItem(CHAT_STORE_KEY);
  } else if (chatState.kind === "value") {
    const migrated = migrateChatSnapshot(chatState.value);
    if (migrated) {
      writeJson(CHAT_STORE_KEY, migrated);
    }
  }

  if (settingsState.kind === "invalid") {
    localStorage.removeItem(SETTINGS_KEY);
  } else if (settingsState.kind === "value") {
    const migrated = migrateSettingsSnapshot(settingsState.value);
    if (migrated) {
      writeJson(SETTINGS_KEY, migrated);
    }
  }

  if (uiState.kind === "invalid") {
    localStorage.removeItem(UI_PREFS_KEY);
  } else if (uiState.kind === "value") {
    const migrated = migrateUiPreferences(uiState.value);
    if (migrated) {
      writeJson(UI_PREFS_KEY, migrated);
    }
  }

  if (templateState.kind === "invalid") {
    localStorage.removeItem(TEMPLATE_STORE_KEY);
  } else if (templateState.kind === "value") {
    const migrated = migrateTemplateSnapshot(templateState.value);
    if (migrated) {
      writeJson(TEMPLATE_STORE_KEY, migrated);
    }
  }
};

const readMigrationVersion = (): number => {
  const raw = localStorage.getItem(MIGRATION_VERSION_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const runMigrations = async (): Promise<void> => {
  if (!canUseStorage()) {
    return;
  }

  const currentVersion = readMigrationVersion();
  if (currentVersion >= CURRENT_MIGRATION_VERSION) {
    return;
  }

  if (currentVersion < 1) {
    migrateToVersion1();
  }

  localStorage.setItem(
    MIGRATION_VERSION_KEY,
    String(CURRENT_MIGRATION_VERSION)
  );
};
