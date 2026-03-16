import type { BackupEnvelope } from "@geohelper/protocol";

import { CHAT_STORE_KEY } from "../state/chat-store";
import { mergeSceneSnapshots, normalizeSceneSnapshot } from "../state/scene-snapshot";
import { SCENE_STORE_KEY } from "../state/scene-store";
import { SETTINGS_KEY } from "../state/settings-store";
import { TEMPLATE_STORE_KEY } from "../state/template-store";
import { UI_PREFS_KEY } from "../state/ui-store";
import {
  asObject,
  canUseStorage,
  parseJsonMaybe,
  syncLiveStoresAfterImport
} from "./backup-snapshot";

interface BackupImportOptionsLike {
  mode?: "replace" | "merge";
}

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
  const merged = new Map<
    string,
    Record<string, unknown> & { id: string; updatedAt: number }
  >();

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

const buildChatSnapshot = (value: unknown): Record<string, unknown> | null => {
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
      candidate && mergedConversations.some((item) => item.id === candidate)
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
        typeof item.updatedAt === "number" ? item.updatedAt : Date.now()
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

const normalizeSettingsSnapshot = (
  value: unknown
): Record<string, unknown> | null => asObject(value);

const normalizeTemplatesSnapshot = (
  value: unknown
): Record<string, unknown> | null => {
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
    .sort((a, b) => (Number(b.time ?? 0) || 0) - (Number(a.time ?? 0) || 0))
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
      candidate && byokPresets.some((item) => item.id === candidate)
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
      candidate && officialPresets.some((item) => item.id === candidate)
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
      candidate && runtimeProfiles.some((item) => item.id === candidate)
  );

  return {
    ...current,
    ...incoming,
    runtimeProfiles,
    defaultRuntimeProfileId: defaultRuntimeProfileId ?? runtimeProfiles[0]?.id,
    byokPresets,
    officialPresets,
    defaultByokPresetId: defaultByokPresetId ?? byokPresets[0]?.id,
    defaultOfficialPresetId: defaultOfficialPresetId ?? officialPresets[0]?.id,
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
  mode: "replace" | "merge"
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

export const applyImportedBackupEnvelopeToStorage = async (
  envelope: BackupEnvelope,
  options: BackupImportOptionsLike = {}
): Promise<BackupEnvelope> => {
  const mode = options.mode ?? "replace";

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
  const currentSettingsSnapshot = parseJsonMaybe(localStorage.getItem(SETTINGS_KEY));
  const currentUiPreferences = parseJsonMaybe(localStorage.getItem(UI_PREFS_KEY));
  const currentTemplatesSnapshot = parseJsonMaybe(
    localStorage.getItem(TEMPLATE_STORE_KEY)
  );
  const currentSceneSnapshot = parseJsonMaybe(localStorage.getItem(SCENE_STORE_KEY));

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
