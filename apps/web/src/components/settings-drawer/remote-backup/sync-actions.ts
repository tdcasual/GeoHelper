import {
  compareGatewayBackup,
  downloadGatewayBackup,
  fetchGatewayBackupHistory,
  protectGatewayBackupSnapshot,
  unprotectGatewayBackupSnapshot,
  uploadGatewayBackup,
  uploadGatewayBackupGuarded
} from "../../../runtime/runtime-service";
import type {
  RemoteBackupSyncStatus,
  RuntimeBackupComparableSummary,
  RuntimeBackupCompareResponse,
  RuntimeBackupDownloadResponse,
  RuntimeBackupGuardedUploadConflictResponse,
  RuntimeBackupMetadata,
  RuntimeBuildIdentity
} from "../../../runtime/types";
import type {
  RemoteBackupSyncResultInput,
  RemoteBackupSyncState
} from "../../../state/settings-store";
import type { BackupEnvelope } from "../../../storage/backup";
import {
  createComparableSummaryFromBackupEnvelope,
  formatRemoteBackupActionMessage,
  formatRemoteBackupProtectionActionMessage,
  formatRemoteBackupProtectionLimitMessage,
  formatRemoteBackupSelectedPullMessage,
  type RemoteBackupPullSource
} from "../../settings-remote-backup";
import type { RemoteBackupActionState } from "../../settings-remote-backup-actions";
import type { BackupModule } from "./load-backup-module";

export interface RemoteBackupPulledResult extends RuntimeBackupDownloadResponse {
  pullSource: RemoteBackupPullSource;
  localSummaryAtPull: RuntimeBackupComparableSummary;
  localEnvelopeAtPull: BackupEnvelope;
}

type RemoteBackupPullResultSetter = (
  value:
    | RemoteBackupPulledResult
    | null
    | ((current: RemoteBackupPulledResult | null) => RemoteBackupPulledResult | null)
) => void;

export interface RemoteBackupSyncActionDeps {
  loadBackupModule: () => Promise<BackupModule>;
  remoteBackupActions: RemoteBackupActionState;
  remoteBackupSync: RemoteBackupSyncState;
  selectedRemoteHistoryBackup: RuntimeBackupMetadata | null;
  readRemoteBackupAdminToken: () => Promise<string | null>;
  beginRemoteBackupSyncCheck: () => void;
  beginRemoteBackupSyncUpload: () => void;
  setRemoteBackupSyncResult: (input: RemoteBackupSyncResultInput) => void;
  setRemoteBackupSyncError: (message: string) => void;
  applyRemoteBackupSnapshotUpdate: (backup: RuntimeBackupMetadata) => void;
  setRemoteBackupBusyAction: (action: string | null) => void;
  setBackupMessage: (message: string | null) => void;
  setRemoteBackupPullResult: RemoteBackupPullResultSetter;
}

const MANUAL_REMOTE_OVERWRITE_BLOCKED_STATUSES = new Set<RemoteBackupSyncStatus>([
  "remote_newer",
  "diverged",
  "upload_blocked_remote_newer",
  "upload_blocked_diverged",
  "upload_conflict",
  "force_upload_required"
]);

const shouldEscalateManualRemoteOverwrite = (
  status: RemoteBackupSyncStatus
): boolean => MANUAL_REMOTE_OVERWRITE_BLOCKED_STATUSES.has(status);

const createRemoteBackupIdenticalComparison = (input: {
  localSummary: RuntimeBackupComparableSummary;
  remoteBackup: RuntimeBackupMetadata;
  build: RuntimeBuildIdentity;
}): RuntimeBackupCompareResponse => ({
  local_status: "summary",
  remote_status: "available",
  comparison_result: "identical",
  local_snapshot: {
    summary: input.localSummary
  },
  remote_snapshot: {
    summary: input.remoteBackup
  },
  build: input.build
});

const createRemoteBackupGuardedConflictComparison = (input: {
  localSummary: RuntimeBackupComparableSummary;
  response: RuntimeBackupGuardedUploadConflictResponse;
  fallbackRemoteBackup: RuntimeBackupMetadata | null;
}): RuntimeBackupCompareResponse => {
  const remoteSummary =
    input.response.actual_remote_snapshot?.summary ?? input.fallbackRemoteBackup;

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

export const createRemoteBackupSyncActions = (deps: RemoteBackupSyncActionDeps) => ({
  handleUploadRemoteBackup: async (
    mode: "guarded" | "force" = "guarded"
  ): Promise<void> => {
    if (!deps.remoteBackupActions.upload.enabled || !deps.remoteBackupActions.gatewayProfile) {
      deps.setBackupMessage(
        deps.remoteBackupActions.upload.reason ?? "当前无法上传到网关"
      );
      return;
    }

    if (
      mode === "guarded" &&
      shouldEscalateManualRemoteOverwrite(deps.remoteBackupSync.status) &&
      deps.remoteBackupSync.lastComparison
    ) {
      deps.setRemoteBackupSyncResult({
        status: "force_upload_required",
        latestRemoteBackup: deps.remoteBackupSync.latestRemoteBackup,
        comparison: deps.remoteBackupSync.lastComparison,
        checkedAt: new Date().toISOString()
      });
      deps.setBackupMessage(
        "默认上传不会自动覆盖当前云端快照；如确认本地为准，请点击“仍然覆盖云端快照”。"
      );
      return;
    }

    deps.setRemoteBackupBusyAction(mode === "force" ? "force-upload" : "upload");
    deps.beginRemoteBackupSyncUpload();
    try {
      const adminToken = await deps.readRemoteBackupAdminToken();
      if (!adminToken) {
        throw new Error("请先保存网关管理员令牌");
      }

      const backup = await deps.loadBackupModule();
      const envelope = await backup.exportCurrentAppBackupEnvelope();
      const localSummary =
        deps.remoteBackupSync.lastComparison?.local_snapshot.summary ??
        createComparableSummaryFromBackupEnvelope(envelope);
      if (mode === "guarded") {
        const guardedResponse = await uploadGatewayBackupGuarded({
          baseUrl: deps.remoteBackupActions.gatewayProfile.baseUrl,
          adminToken,
          envelope,
          expectedRemoteSnapshotId:
            deps.remoteBackupSync.latestRemoteBackup?.snapshot_id ?? null,
          expectedRemoteChecksum: deps.remoteBackupSync.latestRemoteBackup?.checksum
        });

        if (guardedResponse.guarded_write === "conflict") {
          const historyResponse = await fetchGatewayBackupHistory({
            baseUrl: deps.remoteBackupActions.gatewayProfile.baseUrl,
            adminToken,
            limit: 5
          }).catch(() => ({
            history: deps.remoteBackupSync.history,
            build: guardedResponse.build
          }));

          deps.setRemoteBackupSyncResult({
            status: "force_upload_required",
            latestRemoteBackup:
              historyResponse.history[0] ??
              guardedResponse.actual_remote_snapshot?.summary ??
              deps.remoteBackupSync.latestRemoteBackup,
            history: historyResponse.history,
            comparison: createRemoteBackupGuardedConflictComparison({
              localSummary,
              response: guardedResponse,
              fallbackRemoteBackup: deps.remoteBackupSync.latestRemoteBackup
            }),
            checkedAt: new Date().toISOString()
          });
          deps.setBackupMessage(
            "云端快照已变化，默认上传未覆盖；如确认本地为准，请点击“仍然覆盖云端快照”。"
          );
          return;
        }

        deps.setRemoteBackupSyncResult({
          latestRemoteBackup: guardedResponse.backup,
          history: [guardedResponse.backup],
          comparison: createRemoteBackupIdenticalComparison({
            localSummary,
            remoteBackup: guardedResponse.backup,
            build: guardedResponse.build
          }),
          checkedAt: new Date().toISOString()
        });
        deps.setBackupMessage(
          formatRemoteBackupActionMessage("push", guardedResponse.backup)
        );
        return;
      }

      const response = await uploadGatewayBackup({
        baseUrl: deps.remoteBackupActions.gatewayProfile.baseUrl,
        adminToken,
        envelope
      });

      deps.setBackupMessage(formatRemoteBackupActionMessage("push", response.backup));
      deps.setRemoteBackupSyncResult({
        latestRemoteBackup: response.backup,
        history: [response.backup],
        comparison: createRemoteBackupIdenticalComparison({
          localSummary,
          remoteBackup: response.backup,
          build: response.build
        }),
        checkedAt: new Date().toISOString()
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "上传到网关失败";
      deps.setRemoteBackupSyncError(message);
      deps.setBackupMessage(message);
    } finally {
      deps.setRemoteBackupBusyAction(null);
    }
  },

  handleCheckRemoteBackupSync: async (): Promise<void> => {
    if (!deps.remoteBackupActions.check.enabled || !deps.remoteBackupActions.gatewayProfile) {
      deps.setBackupMessage(
        deps.remoteBackupActions.check.reason ?? "当前无法检查云端状态"
      );
      return;
    }

    deps.setRemoteBackupBusyAction("check");
    deps.beginRemoteBackupSyncCheck();
    try {
      const adminToken = await deps.readRemoteBackupAdminToken();
      if (!adminToken) {
        throw new Error("请先保存网关管理员令牌");
      }

      const backup = await deps.loadBackupModule();
      const envelope = await backup.exportCurrentAppBackupEnvelope();
      const localSummary = createComparableSummaryFromBackupEnvelope(envelope);
      const [historyResponse, comparison] = await Promise.all([
        fetchGatewayBackupHistory({
          baseUrl: deps.remoteBackupActions.gatewayProfile.baseUrl,
          adminToken,
          limit: 5
        }),
        compareGatewayBackup({
          baseUrl: deps.remoteBackupActions.gatewayProfile.baseUrl,
          adminToken,
          localSummary
        })
      ]);

      deps.setRemoteBackupSyncResult({
        latestRemoteBackup:
          historyResponse.history[0] ?? comparison.remote_snapshot?.summary ?? null,
        history: historyResponse.history,
        comparison,
        checkedAt: new Date().toISOString()
      });
      deps.setBackupMessage("云端状态检查完成");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "检查云端状态失败";
      deps.setRemoteBackupSyncError(message);
      deps.setBackupMessage(message);
    } finally {
      deps.setRemoteBackupBusyAction(null);
    }
  },

  handlePullRemoteBackup: async (snapshotId?: string): Promise<void> => {
    if (!deps.remoteBackupActions.pull.enabled || !deps.remoteBackupActions.gatewayProfile) {
      deps.setBackupMessage(
        deps.remoteBackupActions.pull.reason ?? "当前无法从网关拉取"
      );
      return;
    }

    deps.setRemoteBackupBusyAction("pull");
    try {
      const adminToken = await deps.readRemoteBackupAdminToken();
      if (!adminToken) {
        throw new Error("请先保存网关管理员令牌");
      }

      const backup = await deps.loadBackupModule();
      const envelope = await backup.exportCurrentAppBackupEnvelope();
      const localSummary =
        deps.remoteBackupSync.lastComparison?.local_snapshot.summary ??
        createComparableSummaryFromBackupEnvelope(envelope);
      const response = await downloadGatewayBackup({
        baseUrl: deps.remoteBackupActions.gatewayProfile.baseUrl,
        adminToken,
        snapshotId
      });
      deps.setRemoteBackupPullResult({
        ...response,
        pullSource: snapshotId ? "selected_history" : "latest",
        localSummaryAtPull: localSummary,
        localEnvelopeAtPull: envelope
      });
      deps.setBackupMessage(
        snapshotId
          ? formatRemoteBackupSelectedPullMessage(response.backup)
          : formatRemoteBackupActionMessage("pull", response.backup)
      );
    } catch (error) {
      deps.setBackupMessage(
        error instanceof Error ? error.message : "从网关拉取失败"
      );
    } finally {
      deps.setRemoteBackupBusyAction(null);
    }
  },

  handleUpdateRemoteBackupProtection: async (
    action: "protect" | "unprotect"
  ): Promise<void> => {
    if (!deps.selectedRemoteHistoryBackup) {
      deps.setBackupMessage("请先选择一个云端保留快照");
      return;
    }

    if (!deps.remoteBackupActions.check.enabled || !deps.remoteBackupActions.gatewayProfile) {
      deps.setBackupMessage(
        deps.remoteBackupActions.check.reason ?? "当前无法更新快照保护状态"
      );
      return;
    }

    deps.setRemoteBackupBusyAction(action);
    try {
      const adminToken = await deps.readRemoteBackupAdminToken();
      if (!adminToken) {
        throw new Error("请先保存网关管理员令牌");
      }

      if (action === "protect") {
        const response = await protectGatewayBackupSnapshot({
          baseUrl: deps.remoteBackupActions.gatewayProfile.baseUrl,
          adminToken,
          snapshotId: deps.selectedRemoteHistoryBackup.snapshot_id
        });

        if (response.protection_status === "limit_reached") {
          deps.setBackupMessage(formatRemoteBackupProtectionLimitMessage(response));
          return;
        }

        deps.applyRemoteBackupSnapshotUpdate(response.backup);
        deps.setRemoteBackupPullResult((current) =>
          current?.backup.snapshot_id === response.backup.snapshot_id
            ? {
                ...current,
                backup: {
                  ...current.backup,
                  ...response.backup
                }
              }
            : current
        );
        deps.setBackupMessage(
          formatRemoteBackupProtectionActionMessage("protect", response.backup)
        );
        return;
      }

      const response = await unprotectGatewayBackupSnapshot({
        baseUrl: deps.remoteBackupActions.gatewayProfile.baseUrl,
        adminToken,
        snapshotId: deps.selectedRemoteHistoryBackup.snapshot_id
      });

      deps.applyRemoteBackupSnapshotUpdate(response.backup);
      deps.setRemoteBackupPullResult((current) =>
        current?.backup.snapshot_id === response.backup.snapshot_id
          ? {
              ...current,
              backup: {
                ...current.backup,
                ...response.backup
              }
            }
          : current
      );
      deps.setBackupMessage(
        formatRemoteBackupProtectionActionMessage("unprotect", response.backup)
      );
    } catch (error) {
      deps.setBackupMessage(
        error instanceof Error
          ? error.message
          : action === "protect"
            ? "保护快照失败"
            : "取消保护失败"
      );
    } finally {
      deps.setRemoteBackupBusyAction(null);
    }
  }
});
