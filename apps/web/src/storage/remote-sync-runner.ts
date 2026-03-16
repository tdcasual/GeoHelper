import type {
  RuntimeBackupCompareResponse,
  RuntimeBackupGuardedUploadResponse,
  RuntimeBackupHistoryResponse
} from "../runtime/types";
import type {
  RemoteBackupSyncResultInput,
  RemoteBackupSyncState
} from "../state/settings-store";
import type { BackupEnvelope } from "./backup";
import type { RemoteSyncReadyConfig } from "./remote-sync-config";
import { toComparableSummary } from "./remote-sync-config";

interface RemoteSyncMetadataProbeDeps {
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
  beginRemoteBackupSyncCheck: () => void;
  setRemoteBackupSyncResult: (input: RemoteBackupSyncResultInput) => void;
  nowIso?: () => string;
}

interface RemoteSyncDelayedUploadDeps {
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
  uploadBackupGuarded: (params: {
    baseUrl: string;
    adminToken: string;
    envelope: BackupEnvelope;
    expectedRemoteSnapshotId?: string | null;
    expectedRemoteChecksum?: string | null;
  }) => Promise<RuntimeBackupGuardedUploadResponse>;
  beginRemoteBackupSyncUpload: () => void;
  setRemoteBackupSyncResult: (input: RemoteBackupSyncResultInput) => void;
  setRemoteBackupSyncError: (message: string) => void;
  getRemoteBackupSyncState: () => RemoteBackupSyncState;
  nowIso?: () => string;
}

const toErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;

export const BLOCKED_DELAYED_UPLOAD_STATUSES = new Set<
  RemoteBackupSyncState["status"]
>([
  "upload_blocked_remote_newer",
  "upload_blocked_diverged",
  "upload_conflict",
  "force_upload_required"
]);

export const shouldSuppressDelayedUpload = (
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

const readResolutionHistory = async (
  deps: Pick<
    RemoteSyncDelayedUploadDeps,
    "fetchBackupHistory" | "getRemoteBackupSyncState"
  >,
  config: RemoteSyncReadyConfig
): Promise<RuntimeBackupHistoryResponse["history"]> => {
  try {
    const response = await deps.fetchBackupHistory({
      baseUrl: config.baseUrl,
      adminToken: config.adminToken,
      limit: 5
    });
    return response.history;
  } catch {
    return deps.getRemoteBackupSyncState().history;
  }
};

export const runRemoteSyncMetadataProbe = async (
  deps: RemoteSyncMetadataProbeDeps,
  config: RemoteSyncReadyConfig
) => {
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

export const runRemoteSyncDelayedUpload = async (
  deps: RemoteSyncDelayedUploadDeps,
  config: RemoteSyncReadyConfig
) => {
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
      const history = await readResolutionHistory(deps, config);
      deps.setRemoteBackupSyncResult({
        status: "upload_blocked_remote_newer",
        latestRemoteBackup:
          history[0] ??
          comparison.remote_snapshot?.summary ??
          deps.getRemoteBackupSyncState().latestRemoteBackup,
        history,
        comparison,
        checkedAt: deps.nowIso?.() ?? new Date().toISOString()
      });
      return;
    }

    if (comparison.comparison_result === "diverged") {
      const history = await readResolutionHistory(deps, config);
      deps.setRemoteBackupSyncResult({
        status: "upload_blocked_diverged",
        latestRemoteBackup:
          history[0] ??
          comparison.remote_snapshot?.summary ??
          deps.getRemoteBackupSyncState().latestRemoteBackup,
        history,
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
      const history = await readResolutionHistory(deps, config);
      deps.setRemoteBackupSyncResult({
        status: "upload_conflict",
        latestRemoteBackup:
          history[0] ??
          response.actual_remote_snapshot?.summary ??
          comparison.remote_snapshot?.summary ??
          deps.getRemoteBackupSyncState().latestRemoteBackup,
        history,
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
  }
};
