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

import { applyImportedBackupEnvelopeToStorage } from "./backup-import";
import {
  asObject,
  canUseStorage,
  getOrCreateBackupDeviceId,
  parseJsonMaybe,
  readCurrentPersistedAppSnapshots
} from "./backup-snapshot";
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

const IMPORT_ROLLBACK_ANCHOR_KEY = "geohelper.backup.import_rollback_anchor";

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
  const {
    chatSnapshot,
    settingsSnapshot,
    uiPreferences,
    templatesSnapshot,
    sceneSnapshot
  } = readCurrentPersistedAppSnapshots();

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

export const importBackupEnvelopeToLocalStorage = async (
  envelope: BackupEnvelope,
  options: BackupImportOptions = {}
): Promise<BackupEnvelope> =>
  applyImportedBackupEnvelopeToStorage(envelope, options);

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
  return applyImportedBackupEnvelopeToStorage(envelope, options);
};
