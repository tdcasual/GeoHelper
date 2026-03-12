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
  type RemoteBackupSyncState,
  type RemoteBackupSyncMode,
  type RemoteBackupSyncResultInput,
  settingsStore
} from "../state/settings-store";

import type { BackupEnvelope } from "./backup";

const DEFAULT_DELAY_MS = 30_000;

type TimerHandle = ReturnType<typeof setTimeout>;

interface RemoteSyncReadyConfig {
  mode: RemoteBackupSyncMode;
  baseUrl: string;
  adminToken: string;
}

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

const getDefaultGatewayBaseUrl = (): string | null => {
  const state = settingsStore.getState();
  const preferred = state.runtimeProfiles.find(
    (profile) =>
      profile.id === state.defaultRuntimeProfileId &&
      profile.target === "gateway" &&
      profile.baseUrl.trim().length > 0
  );
  if (preferred) {
    return preferred.baseUrl.trim();
  }

  return (
    state.runtimeProfiles.find(
      (profile) =>
        profile.target === "gateway" && profile.baseUrl.trim().length > 0
    )?.baseUrl.trim() ?? null
  );
};

const toComparableSummary = (
  envelope: Pick<
    BackupEnvelope,
    | "schema_version"
    | "created_at"
    | "updated_at"
    | "app_version"
    | "checksum"
    | "snapshot_id"
    | "device_id"
    | "base_snapshot_id"
    | "conversations"
  >
): RemoteBackupSyncResultInput["comparison"]["local_snapshot"]["summary"] => ({
  schema_version: envelope.schema_version,
  created_at: envelope.created_at,
  updated_at: envelope.updated_at,
  app_version: envelope.app_version,
  checksum: envelope.checksum,
  conversation_count: envelope.conversations.length,
  snapshot_id: envelope.snapshot_id,
  device_id: envelope.device_id,
  ...(envelope.base_snapshot_id
    ? { base_snapshot_id: envelope.base_snapshot_id }
    : {})
});

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

const toErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;

const BLOCKED_DELAYED_UPLOAD_STATUSES = new Set<RemoteBackupSyncState["status"]>([
  "upload_blocked_remote_newer",
  "upload_blocked_diverged",
  "upload_conflict",
  "force_upload_required"
]);

const shouldSuppressDelayedUpload = (
  status: RemoteBackupSyncState["status"]
): boolean => BLOCKED_DELAYED_UPLOAD_STATUSES.has(status);

const createGuardedConflictComparison = (input: {
  localSummary: RemoteBackupSyncResultInput["comparison"]["local_snapshot"]["summary"];
  response: Extract<RuntimeBackupGuardedUploadResponse, { guarded_write: "conflict" }>;
  fallbackRemoteSummary?: NonNullable<
    RuntimeBackupCompareResponse["remote_snapshot"]
  >["summary"];
}): RuntimeBackupCompareResponse => {
  const remoteSummary =
    input.response.actual_remote_snapshot?.summary ??
    input.fallbackRemoteSummary ??
    null;

  return {
    local_status: "summary",
    remote_status: remoteSummary ? "available" : "missing",
    comparison_result: input.response.comparison_result,
    local_snapshot: {
      summary: input.localSummary
    },
    remote_snapshot: remoteSummary ? { summary: remoteSummary } : null,
    build: input.response.build
  };
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

  const readReadyConfig = async (
    requiredMode?: RemoteBackupSyncMode
  ): Promise<RemoteSyncReadyConfig | null> => {
    const mode = deps.getSyncMode();
    if (mode === "off") {
      return null;
    }
    if (requiredMode && mode !== requiredMode) {
      return null;
    }

    const baseUrl = deps.getGatewayBaseUrl()?.trim();
    if (!baseUrl) {
      return null;
    }

    const adminToken = await deps.readAdminToken();
    if (!adminToken) {
      return null;
    }

    return {
      mode,
      baseUrl,
      adminToken
    };
  };

  const runMetadataProbe = async (config: RemoteSyncReadyConfig) => {
    deps.beginRemoteBackupSyncCheck();
    const envelope = await deps.exportLocalBackupEnvelope();
    const localSummary = toComparableSummary(envelope);
    const [historyResponse, comparison] = await Promise.all([
      deps.fetchBackupHistory({
        baseUrl: config.baseUrl,
        adminToken: config.adminToken,
        limit: 5
      }),
      deps.compareBackup({
        baseUrl: config.baseUrl,
        adminToken: config.adminToken,
        localSummary
      })
    ]);

    deps.setRemoteBackupSyncResult({
      latestRemoteBackup:
        historyResponse.history[0] ?? comparison.remote_snapshot?.summary ?? null,
      history: historyResponse.history,
      comparison,
      checkedAt: deps.nowIso?.() ?? new Date().toISOString()
    });
  };

  const runDelayedUpload = async () => {
    if (disposed || importInProgress || uploadInFlight) {
      return;
    }
    if (shouldSuppressDelayedUpload(deps.getRemoteBackupSyncState().status)) {
      return;
    }

    const config = await readReadyConfig("delayed_upload");
    if (!config) {
      return;
    }

    uploadInFlight = true;
    try {
      deps.beginRemoteBackupSyncUpload();
      const envelope = await deps.exportLocalBackupEnvelope();
      const localSummary = toComparableSummary(envelope);
      const comparison = await deps.compareBackup({
        baseUrl: config.baseUrl,
        adminToken: config.adminToken,
        localSummary
      });

      if (comparison.comparison_result === "remote_newer") {
        deps.setRemoteBackupSyncResult({
          status: "upload_blocked_remote_newer",
          latestRemoteBackup:
            comparison.remote_snapshot?.summary ??
            deps.getRemoteBackupSyncState().latestRemoteBackup,
          comparison,
          checkedAt: deps.nowIso?.() ?? new Date().toISOString()
        });
        return;
      }

      if (comparison.comparison_result === "diverged") {
        deps.setRemoteBackupSyncResult({
          status: "upload_blocked_diverged",
          latestRemoteBackup:
            comparison.remote_snapshot?.summary ??
            deps.getRemoteBackupSyncState().latestRemoteBackup,
          comparison,
          checkedAt: deps.nowIso?.() ?? new Date().toISOString()
        });
        return;
      }

      const response = await deps.uploadBackupGuarded({
        baseUrl: config.baseUrl,
        adminToken: config.adminToken,
        envelope,
        expectedRemoteSnapshotId: comparison.remote_snapshot?.summary.snapshot_id,
        expectedRemoteChecksum: comparison.remote_snapshot?.summary.checksum
      });

      if (response.guarded_write === "conflict") {
        deps.setRemoteBackupSyncResult({
          status: "upload_conflict",
          latestRemoteBackup:
            response.actual_remote_snapshot?.summary ??
            comparison.remote_snapshot?.summary ??
            deps.getRemoteBackupSyncState().latestRemoteBackup,
          comparison: createGuardedConflictComparison({
            localSummary,
            response,
            fallbackRemoteSummary: comparison.remote_snapshot?.summary
          }),
          checkedAt: deps.nowIso?.() ?? new Date().toISOString()
        });
        return;
      }

      deps.setRemoteBackupSyncResult({
        latestRemoteBackup: response.backup,
        history: [response.backup],
        comparison: {
          local_status: "summary",
          remote_status: "available",
          comparison_result: "identical",
          local_snapshot: {
            summary: localSummary
          },
          remote_snapshot: {
            summary: response.backup
          },
          build: response.build
        },
        checkedAt: deps.nowIso?.() ?? new Date().toISOString()
      });
    } catch (error) {
      deps.setRemoteBackupSyncError(
        toErrorMessage(error, "轻量云同步延迟上传失败")
      );
    } finally {
      uploadInFlight = false;
    }
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
        const config = await readReadyConfig();
        if (!config) {
          startupCheckFinished = true;
          return false;
        }

        try {
          await runMetadataProbe(config);
        } catch (error) {
          deps.setRemoteBackupSyncError(
            toErrorMessage(error, "轻量云同步启动检查失败")
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
          void runDelayedUpload();
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
