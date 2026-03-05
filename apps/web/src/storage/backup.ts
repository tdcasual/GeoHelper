import { STORAGE_SCHEMA_VERSION } from "./migrate";
import { CHAT_STORE_KEY } from "../state/chat-store";
import { SETTINGS_KEY } from "../state/settings-store";
import { UI_PREFS_KEY } from "../state/ui-store";

export interface BackupPayload {
  conversations: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
}

export interface BackupEnvelope extends BackupPayload {
  schema_version: number;
  created_at: string;
  app_version: string;
  checksum: string;
}

export const BACKUP_FILENAME = "geochat-backup.json";

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

const checksumOf = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const exportBackup = async (payload: BackupPayload): Promise<Blob> => {
  const envelopeWithoutChecksum = {
    schema_version: STORAGE_SCHEMA_VERSION,
    created_at: new Date().toISOString(),
    app_version: "0.0.1",
    conversations: payload.conversations,
    settings: payload.settings
  };
  const body = JSON.stringify(envelopeWithoutChecksum);
  const envelope: BackupEnvelope = {
    ...envelopeWithoutChecksum,
    checksum: checksumOf(body)
  };

  return new Blob([JSON.stringify(envelope, null, 2)], {
    type: "application/json"
  });
};

export const importBackup = async (blob: Blob): Promise<BackupEnvelope> => {
  const text = await blob.text();
  const envelope = JSON.parse(text) as BackupEnvelope;
  const { checksum, ...rest } = envelope;
  const expectedChecksum = checksumOf(JSON.stringify(rest));

  if (checksum !== expectedChecksum) {
    throw new Error("CHECKSUM_MISMATCH");
  }

  return envelope;
};

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

  return exportBackup({
    conversations: Array.isArray((chatSnapshot as { conversations?: unknown })?.conversations)
      ? ((chatSnapshot as { conversations?: Array<Record<string, unknown>> }).conversations ??
          [])
      : [],
    settings: {
      ui_preferences: uiPreferences,
      chat_snapshot: chatSnapshot,
      settings_snapshot: settingsSnapshot
    }
  });
};

export const importAppBackupToLocalStorage = async (
  blob: Blob
): Promise<BackupEnvelope> => {
  const envelope = await importBackup(blob);

  if (!canUseStorage()) {
    return envelope;
  }

  const chatSnapshot = envelope.settings.chat_snapshot;
  const settingsSnapshot = envelope.settings.settings_snapshot;
  const uiPreferences = envelope.settings.ui_preferences;

  if (chatSnapshot && typeof chatSnapshot === "object") {
    localStorage.setItem(CHAT_STORE_KEY, JSON.stringify(chatSnapshot));
  }
  if (settingsSnapshot && typeof settingsSnapshot === "object") {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsSnapshot));
  }
  if (uiPreferences && typeof uiPreferences === "object") {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify(uiPreferences));
  }

  return envelope;
};
