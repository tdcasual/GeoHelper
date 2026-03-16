import {
  compareGatewayBackup,
  fetchGatewayBackupHistory,
  uploadGatewayBackup,
  uploadGatewayBackupGuarded
} from "../runtime/runtime-service";
import type {
  RuntimeBackupCompareResponse,
  RuntimeBackupGuardedUploadResponse,
  RuntimeBackupHistoryResponse,
  RuntimeBackupUploadResponse
} from "../runtime/types";
import {
  type RemoteBackupSyncMode,
  type RemoteBackupSyncResultInput,
  type RemoteBackupSyncState,
  settingsStore
} from "../state/settings-store";
import type { BackupEnvelope } from "./backup";
import {
  getDefaultGatewayBaseUrl,
  readRemoteSyncReadyConfig
} from "./remote-sync-config";
import {
  runRemoteSyncDelayedUpload,
  runRemoteSyncMetadataProbe,
  shouldSuppressDelayedUpload
} from "./remote-sync-runner";

const DEFAULT_DELAY_MS = 30_000;

type TimerHandle = ReturnType<typeof setTimeout>;

export interface RemoteSyncControllerDeps {
  getSyncMode: () => RemoteBackupSyncMode;
  getRemoteBackupSyncState: () => RemoteBackupSyncState;
  getGatewayBaseUrl: () => string | null;
  readAdminToken: () => Promise<string | null>;
  exportLocalBackupEnvelope: () => Promise<BackupEnvelope>;
  fetchBackupHistory: (params: {
    baseUrl: string;
    adminToken: string;
    limit: number;
  }) => Promise<RuntimeBackupHistoryResponse>;
  compareBackup: (params: {
    baseUrl: string;
    adminToken: string;
    localSummary: RemoteBackupSyncResultInput["comparison"]["local_snapshot"]["summary"];
  }) => Promise<RuntimeBackupCompareResponse>;
  uploadBackup: (params: {
    baseUrl: string;
    adminToken: string;
    envelope: BackupEnvelope;
  }) => Promise<RuntimeBackupUploadResponse>;
  uploadBackupGuarded: (params: {
    baseUrl: string;
    adminToken: string;
    envelope: BackupEnvelope;
    expectedRemoteSnapshotId?: string | null;
    expectedRemoteChecksum?: string | null;
  }) => Promise<RuntimeBackupGuardedUploadResponse>;
  beginRemoteBackupSyncCheck: () => void;
  beginRemoteBackupSyncUpload: () => void;
  setRemoteBackupSyncResult: (input: RemoteBackupSyncResultInput) => void;
  setRemoteBackupSyncError: (message: string) => void;
  nowIso?: () => string;
  setTimer?: (fn: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
  uploadDelayMs?: number;
}

export interface RemoteSyncController {
  ensureStartupSyncCheck: () => Promise<boolean>;
  notifyLocalMutation: () => void;
  setImportInProgress: (value: boolean) => void;
  dispose: () => void;
}

const defaultDeps: RemoteSyncControllerDeps = {
  getSyncMode: () => settingsStore.getState().remoteBackupSyncPreferences.mode,
  getRemoteBackupSyncState: () => settingsStore.getState().remoteBackupSync,
  getGatewayBaseUrl: getDefaultGatewayBaseUrl,
  readAdminToken: () => settingsStore.getState().readRemoteBackupAdminToken(),
  exportLocalBackupEnvelope: async () => {
    const module = await import("./backup");
    return module.exportCurrentAppBackupEnvelope();
  },
  fetchBackupHistory: ({ baseUrl, adminToken, limit }) =>
    fetchGatewayBackupHistory({
      baseUrl,
      adminToken,
      limit
    }),
  compareBackup: ({ baseUrl, adminToken, localSummary }) =>
    compareGatewayBackup({
      baseUrl,
      adminToken,
      localSummary
    }),
  uploadBackup: ({ baseUrl, adminToken, envelope }) =>
    uploadGatewayBackup({
      baseUrl,
      adminToken,
      envelope
    }),
  uploadBackupGuarded: ({
    baseUrl,
    adminToken,
    envelope,
    expectedRemoteSnapshotId,
    expectedRemoteChecksum
  }) =>
    uploadGatewayBackupGuarded({
      baseUrl,
      adminToken,
      envelope,
      expectedRemoteSnapshotId,
      expectedRemoteChecksum
    }),
  beginRemoteBackupSyncCheck: () =>
    settingsStore.getState().beginRemoteBackupSyncCheck(),
  beginRemoteBackupSyncUpload: () =>
    settingsStore.getState().beginRemoteBackupSyncUpload(),
  setRemoteBackupSyncResult: (input) =>
    settingsStore.getState().setRemoteBackupSyncResult(input),
  setRemoteBackupSyncError: (message) =>
    settingsStore.getState().setRemoteBackupSyncError(message),
  nowIso: () => new Date().toISOString(),
  setTimer: (fn, delayMs) => setTimeout(fn, delayMs),
  clearTimer: (timer) => clearTimeout(timer),
  uploadDelayMs: DEFAULT_DELAY_MS
};

export const createRemoteSyncController = (
  depsInput: Partial<RemoteSyncControllerDeps> &
    Pick<
      RemoteSyncControllerDeps,
      | "getSyncMode"
      | "getGatewayBaseUrl"
      | "readAdminToken"
      | "exportLocalBackupEnvelope"
      | "fetchBackupHistory"
      | "compareBackup"
      | "beginRemoteBackupSyncCheck"
      | "setRemoteBackupSyncResult"
      | "setRemoteBackupSyncError"
    >
): RemoteSyncController => {
  const deps: RemoteSyncControllerDeps = {
    ...defaultDeps,
    ...depsInput
  };

  let startupCheckPromise: Promise<boolean> | null = null;
  let startupCheckFinished = false;
  let importInProgress = false;
  let uploadInFlight = false;
  let pendingUploadTimer: TimerHandle | null = null;
  let disposed = false;

  const clearPendingUpload = () => {
    if (!pendingUploadTimer) {
      return;
    }

    deps.clearTimer?.(pendingUploadTimer);
    pendingUploadTimer = null;
  };

  return {
    ensureStartupSyncCheck: async () => {
      if (disposed || startupCheckFinished) {
        return false;
      }
      if (startupCheckPromise) {
        return startupCheckPromise;
      }

      startupCheckPromise = (async () => {
        const config = await readRemoteSyncReadyConfig({
          getSyncMode: deps.getSyncMode,
          getGatewayBaseUrl: deps.getGatewayBaseUrl,
          readAdminToken: deps.readAdminToken
        });
        if (!config) {
          startupCheckFinished = true;
          return false;
        }

        try {
          await runRemoteSyncMetadataProbe(deps, config);
        } catch (error) {
          deps.setRemoteBackupSyncError(
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : "轻量云同步启动检查失败"
          );
        } finally {
          startupCheckFinished = true;
          startupCheckPromise = null;
        }

        return true;
      })();

      return startupCheckPromise;
    },
    notifyLocalMutation: () => {
      if (disposed || importInProgress || deps.getSyncMode() !== "delayed_upload") {
        return;
      }
      if (shouldSuppressDelayedUpload(deps.getRemoteBackupSyncState().status)) {
        return;
      }

      clearPendingUpload();
      pendingUploadTimer = deps.setTimer?.(
        () => {
          pendingUploadTimer = null;
          void (async () => {
            if (disposed || importInProgress || uploadInFlight) {
              return;
            }
            if (shouldSuppressDelayedUpload(deps.getRemoteBackupSyncState().status)) {
              return;
            }

            const config = await readRemoteSyncReadyConfig(
              {
                getSyncMode: deps.getSyncMode,
                getGatewayBaseUrl: deps.getGatewayBaseUrl,
                readAdminToken: deps.readAdminToken
              },
              "delayed_upload"
            );
            if (!config) {
              return;
            }

            uploadInFlight = true;
            try {
              await runRemoteSyncDelayedUpload(deps, config);
            } finally {
              uploadInFlight = false;
            }
          })();
        },
        deps.uploadDelayMs ?? DEFAULT_DELAY_MS
      ) as TimerHandle;
    },
    setImportInProgress: (value) => {
      importInProgress = value;
      if (value) {
        clearPendingUpload();
      }
    },
    dispose: () => {
      disposed = true;
      clearPendingUpload();
    }
  };
};

export const remoteSyncController = createRemoteSyncController(defaultDeps);

export const ensureRemoteSyncStartupCheck = (): Promise<boolean> =>
  remoteSyncController.ensureStartupSyncCheck();

export const notifyRemoteSyncLocalMutation = (): void =>
  remoteSyncController.notifyLocalMutation();

export const setRemoteSyncImportInProgress = (value: boolean): void =>
  remoteSyncController.setImportInProgress(value);
