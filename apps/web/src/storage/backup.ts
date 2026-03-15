import type {
  BackupEnvelope,
  BackupInspection,
  BackupPayload
} from "@geohelper/protocol";
import {
  createBackupBlob,
  createBackupEnvelope,
  inspectBackupEnvelope,
  parseBackupEnvelope
} from "@geohelper/protocol";

import { CHAT_STORE_KEY, syncChatStoreFromStorage } from "../state/chat-store";
import { mergeSceneSnapshots, normalizeSceneSnapshot } from "../state/scene-snapshot";
import { SCENE_STORE_KEY, sceneStore, syncSceneStoreFromStorage } from "../state/scene-store";
import { SETTINGS_KEY, syncSettingsStoreFromStorage } from "../state/settings-store";
import { syncTemplateStoreFromStorage,TEMPLATE_STORE_KEY } from "../state/template-store";
import { syncUIStoreFromStorage,UI_PREFS_KEY } from "../state/ui-store";
import { STORAGE_SCHEMA_VERSION } from "./migrate";


export type BackupImportMode = "replace" | "merge";

export type ImportRollbackAnchorSource =
  | "local_file"
  | "remote_latest"
  | "remote_selected_history";

export interface BackupImportOptions {
  mode?: BackupImportMode;
}

export interface ImportRollbackAnchor {
  capturedAt: string;
  source: ImportRollbackAnchorSource;
  importMode: BackupImportMode;
  sourceDetail: string | null;
  envelope: BackupEnvelope;
  importedAt?: string | null;
  resultEnvelope?: BackupEnvelope | null;
}

export interface CaptureImportRollbackAnchorOptions {
  source: ImportRollbackAnchorSource;
  importMode: BackupImportMode;
  sourceDetail?: string | null;
}

export const BACKUP_FILENAME = "geochat-backup.json";

export type { BackupEnvelope, BackupInspection, BackupPayload };

const BACKUP_DEVICE_ID_KEY = "geohelper.backup.device_id";
const IMPORT_ROLLBACK_ANCHOR_KEY = "geohelper.backup.import_rollback_anchor";

const makeBackupDeviceId = (): string =>
  `device_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;

const canUseStorage = (): boolean =>
  typeof localStorage !== "undefined" &&
  typeof localStorage.getItem === "function" &&
  typeof localStorage.setItem === "function";

const parseJsonMaybe = (raw: string | null): unknown => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const parseImportRollbackAnchor = (value: unknown): ImportRollbackAnchor | null => {
  const anchor = asObject(value);
  if (!anchor) {
    return null;
  }

  const capturedAt =
    typeof anchor.capturedAt === "string" && anchor.capturedAt.trim()
      ? anchor.capturedAt
      : null;
  const source =
    anchor.source === "local_file" ||
    anchor.source === "remote_latest" ||
    anchor.source === "remote_selected_history"
      ? anchor.source
      : null;
  const importMode =
    anchor.importMode === "replace" || anchor.importMode === "merge"
      ? anchor.importMode
      : null;

  if (!capturedAt || !source || !importMode) {
    return null;
  }

  try {
    const importedAt =
      typeof anchor.importedAt === "string" && anchor.importedAt.trim()
        ? anchor.importedAt
        : null;
    return {
      capturedAt,
      source,
      importMode,
      sourceDetail:
        typeof anchor.sourceDetail === "string" && anchor.sourceDetail.trim()
          ? anchor.sourceDetail
          : null,
      envelope: parseBackupEnvelope(anchor.envelope),
      importedAt,
      resultEnvelope: anchor.resultEnvelope
        ? parseBackupEnvelope(anchor.resultEnvelope)
        : null
    };
  } catch {
    return null;
  }
};

const toConversationList = (
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
        typeof item.updatedAt === "number"
          ? item.updatedAt
          : typeof item.createdAt === "number"
            ? item.createdAt
            : Date.now(),
      createdAt:
        typeof item.createdAt === "number"
          ? item.createdAt
          : typeof item.updatedAt === "number"
            ? item.updatedAt
            : Date.now(),
      title:
        typeof item.title === "string" && item.title.trim()
          ? item.title
          : "新会话",
      messages: Array.isArray(item.messages) ? item.messages : []
    }))
    .filter((item) => item.id.length > 0);
};

const mergeByIdAndUpdatedAt = (
  current: Array<Record<string, unknown> & { id: string; updatedAt: number }>,
  incoming: Array<Record<string, unknown> & { id: string; updatedAt: number }>
): Array<Record<string, unknown> & { id: string; updatedAt: number }> => {
  const merged = new Map<string, Record<string, unknown> & { id: string; updatedAt: number }>();

  for (const item of current) {
    merged.set(item.id, item);
  }

  for (const item of incoming) {
    const existing = merged.get(item.id);
    if (!existing || item.updatedAt >= existing.updatedAt) {
      merged.set(item.id, item);
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
};

const buildChatSnapshot = (
  value: unknown
): Record<string, unknown> | null => {
  const source = asObject(value);
  if (!source) {
    return null;
  }

  const conversations = toConversationList(source.conversations);
  const activeConversationId =
    typeof source.activeConversationId === "string" &&
    conversations.some((item) => item.id === source.activeConversationId)
      ? source.activeConversationId
      : conversations[0]?.id ?? null;
  const activeMessages = activeConversationId
    ? (conversations.find((item) => item.id === activeConversationId)?.messages ??
      [])
    : [];

  return {
    mode: source.mode ?? "byok",
    sessionToken:
      typeof source.sessionToken === "string" ? source.sessionToken : null,
    conversations,
    activeConversationId,
    messages: Array.isArray(activeMessages) ? activeMessages : [],
    reauthRequired: Boolean(source.reauthRequired)
  };
};

const mergeChatSnapshot = (
  currentRaw: unknown,
  incomingRaw: unknown
): Record<string, unknown> | null => {
  const current = buildChatSnapshot(currentRaw);
  const incoming = buildChatSnapshot(incomingRaw);

  if (!current && !incoming) {
    return null;
  }
  if (!current) {
    return incoming;
  }
  if (!incoming) {
    return current;
  }

  const mergedConversations = mergeByIdAndUpdatedAt(
    toConversationList(current.conversations),
    toConversationList(incoming.conversations)
  );
  const currentActive =
    typeof current.activeConversationId === "string"
      ? current.activeConversationId
      : undefined;
  const incomingActive =
    typeof incoming.activeConversationId === "string"
      ? incoming.activeConversationId
      : undefined;
  const activeConversationId = [currentActive, incomingActive].find(
    (candidate) =>
      candidate &&
      mergedConversations.some((item) => item.id === candidate)
  );
  const activeMessages = activeConversationId
    ? (mergedConversations.find((item) => item.id === activeConversationId)
        ?.messages ?? [])
    : [];

  return {
    mode: current.mode ?? incoming.mode ?? "byok",
    sessionToken: current.sessionToken ?? incoming.sessionToken ?? null,
    conversations: mergedConversations,
    activeConversationId: activeConversationId ?? mergedConversations[0]?.id ?? null,
    messages: Array.isArray(activeMessages) ? activeMessages : [],
    reauthRequired: Boolean(current.reauthRequired ?? incoming.reauthRequired)
  };
};

const toPresetList = (
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
        typeof item.updatedAt === "number"
          ? item.updatedAt
          : Date.now()
    }))
    .filter((item) => item.id.length > 0);
};

const toTemplateList = (
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
    .filter((item) => item.id.length > 0 && item.prompt.length > 0);
};

const normalizeSettingsSnapshot = (value: unknown): Record<string, unknown> | null =>
  asObject(value);

const normalizeTemplatesSnapshot = (value: unknown): Record<string, unknown> | null => {
  if (Array.isArray(value)) {
    return {
      schemaVersion: 1,
      templates: toTemplateList(value)
    };
  }

  const snapshot = asObject(value);
  if (!snapshot) {
    return null;
  }

  return {
    schemaVersion: 1,
    templates: toTemplateList(snapshot.templates)
  };
};

const mergeSettingsSnapshot = (
  currentRaw: unknown,
  incomingRaw: unknown
): Record<string, unknown> | null => {
  const current = normalizeSettingsSnapshot(currentRaw);
  const incoming = normalizeSettingsSnapshot(incomingRaw);

  if (!current && !incoming) {
    return null;
  }
  if (!current) {
    return incoming;
  }
  if (!incoming) {
    return current;
  }

  const byokPresets = mergeByIdAndUpdatedAt(
    toPresetList(current.byokPresets),
    toPresetList(incoming.byokPresets)
  );
  const officialPresets = mergeByIdAndUpdatedAt(
    toPresetList(current.officialPresets),
    toPresetList(incoming.officialPresets)
  );
  const runtimeProfiles = mergeByIdAndUpdatedAt(
    toPresetList(current.runtimeProfiles),
    toPresetList(incoming.runtimeProfiles)
  );
  const currentSessionOverrides = asObject(current.sessionOverrides) ?? {};
  const incomingSessionOverrides = asObject(incoming.sessionOverrides) ?? {};
  const currentExperimentFlags = asObject(current.experimentFlags) ?? {};
  const incomingExperimentFlags = asObject(incoming.experimentFlags) ?? {};
  const currentRequestDefaults = asObject(current.requestDefaults) ?? {};
  const incomingRequestDefaults = asObject(incoming.requestDefaults) ?? {};
  const currentDebugEvents = Array.isArray(current.debugEvents)
    ? current.debugEvents
    : [];
  const incomingDebugEvents = Array.isArray(incoming.debugEvents)
    ? incoming.debugEvents
    : [];
  const debugEvents = [...currentDebugEvents, ...incomingDebugEvents]
    .map((item) => asObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .sort(
      (a, b) =>
        (Number(b.time ?? 0) || 0) - (Number(a.time ?? 0) || 0)
    )
    .slice(0, 100);

  const currentDefaultByokPresetId =
    typeof current.defaultByokPresetId === "string"
      ? current.defaultByokPresetId
      : undefined;
  const incomingDefaultByokPresetId =
    typeof incoming.defaultByokPresetId === "string"
      ? incoming.defaultByokPresetId
      : undefined;
  const defaultByokPresetId = [incomingDefaultByokPresetId, currentDefaultByokPresetId].find(
    (candidate) =>
      candidate &&
      byokPresets.some((item) => item.id === candidate)
  );

  const currentDefaultOfficialPresetId =
    typeof current.defaultOfficialPresetId === "string"
      ? current.defaultOfficialPresetId
      : undefined;
  const incomingDefaultOfficialPresetId =
    typeof incoming.defaultOfficialPresetId === "string"
      ? incoming.defaultOfficialPresetId
      : undefined;
  const defaultOfficialPresetId = [
    incomingDefaultOfficialPresetId,
    currentDefaultOfficialPresetId
  ].find(
    (candidate) =>
      candidate &&
      officialPresets.some((item) => item.id === candidate)
  );
  const currentDefaultRuntimeProfileId =
    typeof current.defaultRuntimeProfileId === "string"
      ? current.defaultRuntimeProfileId
      : undefined;
  const incomingDefaultRuntimeProfileId =
    typeof incoming.defaultRuntimeProfileId === "string"
      ? incoming.defaultRuntimeProfileId
      : undefined;
  const defaultRuntimeProfileId = [
    incomingDefaultRuntimeProfileId,
    currentDefaultRuntimeProfileId
  ].find(
    (candidate) =>
      candidate &&
      runtimeProfiles.some((item) => item.id === candidate)
  );

  return {
    ...current,
    ...incoming,
    runtimeProfiles,
    defaultRuntimeProfileId:
      defaultRuntimeProfileId ?? runtimeProfiles[0]?.id,
    byokPresets,
    officialPresets,
    defaultByokPresetId: defaultByokPresetId ?? byokPresets[0]?.id,
    defaultOfficialPresetId:
      defaultOfficialPresetId ?? officialPresets[0]?.id,
    sessionOverrides: {
      ...currentSessionOverrides,
      ...incomingSessionOverrides
    },
    experimentFlags: {
      ...currentExperimentFlags,
      ...incomingExperimentFlags
    },
    requestDefaults: {
      ...currentRequestDefaults,
      ...incomingRequestDefaults
    },
    debugEvents
  };
};

const mergeUiPreferences = (
  currentRaw: unknown,
  incomingRaw: unknown
): Record<string, unknown> | null => {
  const current = asObject(currentRaw);
  const incoming = asObject(incomingRaw);

  if (!current && !incoming) {
    return null;
  }
  if (!current) {
    return incoming;
  }
  if (!incoming) {
    return current;
  }

  return {
    ...current,
    ...incoming
  };
};

const mergeTemplatesSnapshot = (
  currentRaw: unknown,
  incomingRaw: unknown
): Record<string, unknown> | null => {
  const current = normalizeTemplatesSnapshot(currentRaw);
  const incoming = normalizeTemplatesSnapshot(incomingRaw);

  if (!current && !incoming) {
    return null;
  }
  if (!current) {
    return incoming;
  }
  if (!incoming) {
    return current;
  }

  return {
    schemaVersion: 1,
    templates: mergeByIdAndUpdatedAt(
      toTemplateList(current.templates),
      toTemplateList(incoming.templates)
    )
  };
};

const writeSnapshotToStorage = (
  key: string,
  value: unknown,
  mode: BackupImportMode
): void => {
  const snapshot = asObject(value);
  if (snapshot) {
    localStorage.setItem(key, JSON.stringify(snapshot));
    return;
  }

  if (mode === "replace") {
    localStorage.removeItem(key);
  }
};

const getOrCreateBackupDeviceId = (): string => {
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

export const exportBackup = async (payload: BackupPayload): Promise<Blob> => {
  const createdAt = new Date().toISOString();
  return createBackupBlob(
    createBackupEnvelope(payload, {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      createdAt,
      updatedAt: createdAt,
      appVersion: "0.0.1",
      deviceId: getOrCreateBackupDeviceId()
    })
  );
};

export const importBackup = async (blob: Blob): Promise<BackupEnvelope> => {
  const text = await blob.text();
  return parseBackupEnvelope(JSON.parse(text));
};

export const inspectBackup = async (blob: Blob): Promise<BackupInspection> =>
  inspectBackupEnvelope(await importBackup(blob), STORAGE_SCHEMA_VERSION);

export const readImportRollbackAnchor = (): ImportRollbackAnchor | null => {
  if (!canUseStorage()) {
    return null;
  }

  const parsed = parseImportRollbackAnchor(
    parseJsonMaybe(localStorage.getItem(IMPORT_ROLLBACK_ANCHOR_KEY))
  );

  if (!parsed && localStorage.getItem(IMPORT_ROLLBACK_ANCHOR_KEY)) {
    localStorage.removeItem(IMPORT_ROLLBACK_ANCHOR_KEY);
  }

  return parsed;
};

export const clearImportRollbackAnchor = (): void => {
  if (!canUseStorage()) {
    return;
  }

  localStorage.removeItem(IMPORT_ROLLBACK_ANCHOR_KEY);
};

export const captureCurrentAppImportRollbackAnchor = async (
  options: CaptureImportRollbackAnchorOptions
): Promise<ImportRollbackAnchor> => {
  if (!canUseStorage()) {
    throw new Error("当前环境不支持导入前恢复锚点");
  }

  const anchor: ImportRollbackAnchor = {
    capturedAt: new Date().toISOString(),
    source: options.source,
    importMode: options.importMode,
    sourceDetail:
      typeof options.sourceDetail === "string" && options.sourceDetail.trim()
        ? options.sourceDetail
        : null,
    envelope: await exportCurrentAppBackupEnvelope(),
    importedAt: null,
    resultEnvelope: null
  };

  localStorage.setItem(IMPORT_ROLLBACK_ANCHOR_KEY, JSON.stringify(anchor));
  return anchor;
};

export const recordCurrentAppImportRollbackResult = async (): Promise<ImportRollbackAnchor> => {
  if (!canUseStorage()) {
    throw new Error("当前环境不支持导入结果记录");
  }

  const anchor = readImportRollbackAnchor();
  if (!anchor) {
    throw new Error("当前没有可更新的导入前恢复锚点");
  }

  const updatedAnchor: ImportRollbackAnchor = {
    ...anchor,
    importedAt: new Date().toISOString(),
    resultEnvelope: await exportCurrentAppBackupEnvelope()
  };

  localStorage.setItem(IMPORT_ROLLBACK_ANCHOR_KEY, JSON.stringify(updatedAnchor));
  return updatedAnchor;
};

export const exportCurrentAppBackupEnvelope = async (): Promise<BackupEnvelope> =>
  importBackup(await exportCurrentAppBackup());

export const exportCurrentAppBackup = async (): Promise<Blob> => {
  const chatSnapshot = canUseStorage()
    ? parseJsonMaybe(localStorage.getItem(CHAT_STORE_KEY))
    : null;
  const settingsSnapshot = canUseStorage()
    ? parseJsonMaybe(localStorage.getItem(SETTINGS_KEY))
    : null;
  const uiPreferences = canUseStorage()
    ? parseJsonMaybe(localStorage.getItem(UI_PREFS_KEY))
    : null;
  const templatesSnapshot = canUseStorage()
    ? parseJsonMaybe(localStorage.getItem(TEMPLATE_STORE_KEY))
    : null;
  const sceneSnapshot = canUseStorage()
    ? parseJsonMaybe(localStorage.getItem(SCENE_STORE_KEY))
    : null;

  return exportBackup({
    conversations: Array.isArray((chatSnapshot as { conversations?: unknown })?.conversations)
      ? ((chatSnapshot as { conversations?: Array<Record<string, unknown>> }).conversations ??
          [])
      : [],
    settings: {
      ui_preferences: uiPreferences,
      chat_snapshot: chatSnapshot,
      settings_snapshot: settingsSnapshot,
      templates_snapshot: templatesSnapshot,
      scene_snapshot: sceneSnapshot
    }
  });
};

const syncLiveStoresAfterImport = async (): Promise<void> => {
  syncChatStoreFromStorage();
  syncSettingsStoreFromStorage();
  syncUIStoreFromStorage();
  syncTemplateStoreFromStorage();
  syncSceneStoreFromStorage();
  await sceneStore.getState().rehydrateScene();
};

export const importBackupEnvelopeToLocalStorage = async (
  envelope: BackupEnvelope,
  options: BackupImportOptions = {}
): Promise<BackupEnvelope> =>
  importAppBackupToLocalStorage(createBackupBlob(envelope), options);

export const importRemoteBackupToLocalStorage = async (
  remoteBackup: { envelope: BackupEnvelope },
  options: BackupImportOptions = {}
): Promise<BackupEnvelope> =>
  importBackupEnvelopeToLocalStorage(remoteBackup.envelope, options);

export const restoreImportRollbackAnchorToLocalStorage = async (): Promise<ImportRollbackAnchor> => {
  const anchor = readImportRollbackAnchor();
  if (!anchor) {
    throw new Error("当前没有可恢复的导入前本地快照");
  }

  await importBackupEnvelopeToLocalStorage(anchor.envelope, {
    mode: "replace"
  });
  clearImportRollbackAnchor();
  return anchor;
};

export const importAppBackupToLocalStorage = async (
  blob: Blob,
  options: BackupImportOptions = {}
): Promise<BackupEnvelope> => {
  const envelope = await importBackup(blob);
  const mode: BackupImportMode = options.mode ?? "replace";

  if (!canUseStorage()) {
    return envelope;
  }

  const incomingSettings = asObject(envelope.settings) ?? {};
  const hasStructuredSettings =
    Object.prototype.hasOwnProperty.call(incomingSettings, "chat_snapshot") ||
    Object.prototype.hasOwnProperty.call(incomingSettings, "settings_snapshot") ||
    Object.prototype.hasOwnProperty.call(incomingSettings, "ui_preferences") ||
    Object.prototype.hasOwnProperty.call(incomingSettings, "templates_snapshot") ||
    Object.prototype.hasOwnProperty.call(incomingSettings, "scene_snapshot");
  const incomingChatSnapshot =
    incomingSettings.chat_snapshot ??
    (Array.isArray(envelope.conversations)
      ? {
          mode: "byok",
          sessionToken: null,
          conversations: envelope.conversations,
          activeConversationId:
            typeof envelope.conversations[0]?.id === "string"
              ? String(envelope.conversations[0].id)
              : null,
          messages: Array.isArray(envelope.conversations[0]?.messages)
            ? envelope.conversations[0].messages
            : [],
          reauthRequired: false
        }
      : null);
  const incomingSettingsSnapshot =
    incomingSettings.settings_snapshot ??
    (hasStructuredSettings ? null : incomingSettings);
  const incomingUiPreferences = incomingSettings.ui_preferences;
  const incomingTemplatesSnapshot = incomingSettings.templates_snapshot;
  const incomingSceneSnapshot = incomingSettings.scene_snapshot;

  if (mode === "replace") {
    writeSnapshotToStorage(CHAT_STORE_KEY, buildChatSnapshot(incomingChatSnapshot), mode);
    writeSnapshotToStorage(
      SETTINGS_KEY,
      normalizeSettingsSnapshot(incomingSettingsSnapshot),
      mode
    );
    writeSnapshotToStorage(UI_PREFS_KEY, asObject(incomingUiPreferences), mode);
    writeSnapshotToStorage(
      TEMPLATE_STORE_KEY,
      normalizeTemplatesSnapshot(incomingTemplatesSnapshot),
      mode
    );
    writeSnapshotToStorage(
      SCENE_STORE_KEY,
      normalizeSceneSnapshot(incomingSceneSnapshot),
      mode
    );
    await syncLiveStoresAfterImport();
    return envelope;
  }

  const currentChatSnapshot = parseJsonMaybe(localStorage.getItem(CHAT_STORE_KEY));
  const currentSettingsSnapshot = parseJsonMaybe(
    localStorage.getItem(SETTINGS_KEY)
  );
  const currentUiPreferences = parseJsonMaybe(localStorage.getItem(UI_PREFS_KEY));
  const currentTemplatesSnapshot = parseJsonMaybe(
    localStorage.getItem(TEMPLATE_STORE_KEY)
  );
  const currentSceneSnapshot = parseJsonMaybe(
    localStorage.getItem(SCENE_STORE_KEY)
  );

  writeSnapshotToStorage(
    CHAT_STORE_KEY,
    mergeChatSnapshot(currentChatSnapshot, incomingChatSnapshot),
    mode
  );
  writeSnapshotToStorage(
    SETTINGS_KEY,
    mergeSettingsSnapshot(currentSettingsSnapshot, incomingSettingsSnapshot),
    mode
  );
  writeSnapshotToStorage(
    UI_PREFS_KEY,
    mergeUiPreferences(currentUiPreferences, incomingUiPreferences),
    mode
  );
  writeSnapshotToStorage(
    TEMPLATE_STORE_KEY,
    mergeTemplatesSnapshot(currentTemplatesSnapshot, incomingTemplatesSnapshot),
    mode
  );
  writeSnapshotToStorage(
    SCENE_STORE_KEY,
    mergeSceneSnapshots(currentSceneSnapshot, incomingSceneSnapshot),
    mode
  );

  await syncLiveStoresAfterImport();
  return envelope;
};
