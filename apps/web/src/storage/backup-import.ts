import type { BackupEnvelope } from "@geohelper/protocol";

import { CHAT_STORE_KEY } from "../state/chat-store";
import { mergeSceneSnapshots, normalizeSceneSnapshot } from "../state/scene-snapshot";
import { SCENE_STORE_KEY } from "../state/scene-store";
import { SETTINGS_KEY } from "../state/settings-store";
import { TEMPLATE_STORE_KEY } from "../state/template-store";
import { UI_PREFS_KEY } from "../state/ui-store";
import { buildChatSnapshot, mergeChatSnapshot } from "./backup-import-chat";
import {
  mergeSettingsSnapshot,
  mergeUiPreferences,
  normalizeSettingsSnapshot
} from "./backup-import-settings";
import {
  mergeTemplatesSnapshot,
  normalizeTemplatesSnapshot
} from "./backup-import-templates";
import {
  asObject,
  canUseStorage,
  parseJsonMaybe,
  syncLiveStoresAfterImport
} from "./backup-snapshot";

interface BackupImportOptionsLike {
  mode?: "replace" | "merge";
}

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

const resolveIncomingSnapshots = (envelope: BackupEnvelope) => {
  const incomingSettings = asObject(envelope.settings) ?? {};
  const hasStructuredSettings =
    Object.prototype.hasOwnProperty.call(incomingSettings, "chat_snapshot") ||
    Object.prototype.hasOwnProperty.call(incomingSettings, "settings_snapshot") ||
    Object.prototype.hasOwnProperty.call(incomingSettings, "ui_preferences") ||
    Object.prototype.hasOwnProperty.call(incomingSettings, "templates_snapshot") ||
    Object.prototype.hasOwnProperty.call(incomingSettings, "scene_snapshot");

  return {
    incomingChatSnapshot:
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
        : null),
    incomingSettingsSnapshot:
      incomingSettings.settings_snapshot ??
      (hasStructuredSettings ? null : incomingSettings),
    incomingUiPreferences: incomingSettings.ui_preferences,
    incomingTemplatesSnapshot: incomingSettings.templates_snapshot,
    incomingSceneSnapshot: incomingSettings.scene_snapshot
  };
};

export const applyImportedBackupEnvelopeToStorage = async (
  envelope: BackupEnvelope,
  options: BackupImportOptionsLike = {}
): Promise<BackupEnvelope> => {
  const mode = options.mode ?? "replace";

  if (!canUseStorage()) {
    return envelope;
  }

  const {
    incomingChatSnapshot,
    incomingSettingsSnapshot,
    incomingUiPreferences,
    incomingTemplatesSnapshot,
    incomingSceneSnapshot
  } = resolveIncomingSnapshots(envelope);

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
