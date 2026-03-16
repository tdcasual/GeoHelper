import {
  type ChangeEventHandler,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import {
  compareGatewayBackup,
  downloadGatewayBackup,
  fetchGatewayBackupHistory,
  protectGatewayBackupSnapshot,
  unprotectGatewayBackupSnapshot,
  uploadGatewayBackup,
  uploadGatewayBackupGuarded
} from "../../runtime/runtime-service";
import type {
  RemoteBackupSyncStatus,
  RuntimeBackupComparableSummary,
  RuntimeBackupCompareResponse,
  RuntimeBackupDownloadResponse,
  RuntimeBackupGuardedUploadConflictResponse,
  RuntimeBackupMetadata,
  RuntimeBuildIdentity
} from "../../runtime/types";
import { useSettingsStore } from "../../state/settings-store";
import {
  type BackupEnvelope,
  type BackupImportMode,
  type BackupInspection,
  type ImportRollbackAnchor
} from "../../storage/backup";
import { setRemoteSyncImportInProgress } from "../../storage/remote-sync";
import {
  createComparableSummaryFromBackupEnvelope,
  formatRemoteBackupActionMessage,
  formatRemoteBackupHistorySummary,
  formatRemoteBackupProtectionActionMessage,
  formatRemoteBackupProtectionLimitMessage,
  formatRemoteBackupSelectedPullMessage,
  type RemoteBackupPullSource,
  resolveImportActionGuardPresentation,
  resolveImportRollbackAnchorPresentation,
  resolveRemoteBackupActions,
  resolveRemoteBackupHistoryComparisonPresentation,
  resolveRemoteBackupHistorySelectionPresentation,
  resolveRemoteBackupPulledConversationImpactPresentation,
  resolveRemoteBackupPulledPreviewGuardPresentation,
  resolveRemoteBackupPulledPreviewPresentation,
  resolveRemoteBackupSyncPresentation} from "../settings-remote-backup";

interface RemoteBackupPulledResult extends RuntimeBackupDownloadResponse {
  pullSource: RemoteBackupPullSource;
  localSummaryAtPull: RuntimeBackupComparableSummary;
  localEnvelopeAtPull: BackupEnvelope;
}

type BackupModule = typeof import("../../storage/backup");

let backupModulePromise: Promise<BackupModule> | null = null;

const loadBackupModule = (): Promise<BackupModule> => {
  if (!backupModulePromise) {
    backupModulePromise = import("../../storage/backup");
  }

  return backupModulePromise;
};

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

export const useRemoteBackupControls = (input: { open: boolean }) => {
  const remoteBackupAdminTokenCipher = useSettingsStore(
    (state) => state.remoteBackupAdminTokenCipher
  );
  const remoteBackupSyncPreferences = useSettingsStore(
    (state) => state.remoteBackupSyncPreferences
  );
  const remoteBackupSync = useSettingsStore((state) => state.remoteBackupSync);
  const setRemoteBackupAdminToken = useSettingsStore(
    (state) => state.setRemoteBackupAdminToken
  );
  const readRemoteBackupAdminToken = useSettingsStore(
    (state) => state.readRemoteBackupAdminToken
  );
  const clearRemoteBackupAdminToken = useSettingsStore(
    (state) => state.clearRemoteBackupAdminToken
  );
  const setRemoteBackupSyncMode = useSettingsStore(
    (state) => state.setRemoteBackupSyncMode
  );
  const beginRemoteBackupSyncCheck = useSettingsStore(
    (state) => state.beginRemoteBackupSyncCheck
  );
  const beginRemoteBackupSyncUpload = useSettingsStore(
    (state) => state.beginRemoteBackupSyncUpload
  );
  const setRemoteBackupSyncResult = useSettingsStore(
    (state) => state.setRemoteBackupSyncResult
  );
  const setRemoteBackupSyncError = useSettingsStore(
    (state) => state.setRemoteBackupSyncError
  );
  const applyRemoteBackupSnapshotUpdate = useSettingsStore(
    (state) => state.applyRemoteBackupSnapshotUpdate
  );
  const runtimeProfiles = useSettingsStore((state) => state.runtimeProfiles);
  const defaultRuntimeProfileId = useSettingsStore(
    (state) => state.defaultRuntimeProfileId
  );

  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [remoteBackupAdminTokenDraft, setRemoteBackupAdminTokenDraft] =
    useState("");
  const [remoteBackupBusyAction, setRemoteBackupBusyAction] = useState<
    string | null
  >(null);
  const [remoteBackupPullResult, setRemoteBackupPullResult] =
    useState<RemoteBackupPulledResult | null>(null);
  const [selectedRemoteHistorySnapshotId, setSelectedRemoteHistorySnapshotId] =
    useState<string | null>(null);
  const [pendingBackupFile, setPendingBackupFile] = useState<File | null>(null);
  const [backupInspection, setBackupInspection] =
    useState<BackupInspection | null>(null);
  const [importRollbackAnchor, setImportRollbackAnchor] =
    useState<ImportRollbackAnchor | null>(null);
  const [rollbackAnchorCurrentLocalEnvelope, setRollbackAnchorCurrentLocalEnvelope] =
    useState<BackupEnvelope | null>(null);
  const [localMergeImportArmed, setLocalMergeImportArmed] = useState(false);
  const [localReplaceImportArmed, setLocalReplaceImportArmed] = useState(false);
  const [remoteMergeImportArmed, setRemoteMergeImportArmed] = useState(false);
  const [remoteReplaceImportArmed, setRemoteReplaceImportArmed] = useState(false);
  const [importingBackup, setImportingBackup] = useState(false);
  const [rollbackAnchorBusy, setRollbackAnchorBusy] = useState(false);
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  const remoteBackupActions = useMemo(
    () =>
      resolveRemoteBackupActions({
        runtimeProfiles,
        defaultRuntimeProfileId,
        hasAdminToken: Boolean(remoteBackupAdminTokenCipher),
        hasPulledBackup: Boolean(remoteBackupPullResult)
      }),
    [
      defaultRuntimeProfileId,
      remoteBackupAdminTokenCipher,
      remoteBackupPullResult,
      runtimeProfiles
    ]
  );
  const remoteBackupSyncPresentation = useMemo(
    () => resolveRemoteBackupSyncPresentation(remoteBackupSync),
    [remoteBackupSync]
  );
  const latestRemoteHistorySnapshotId =
    remoteBackupSync.history[0]?.snapshot_id ??
    remoteBackupSync.latestRemoteBackup?.snapshot_id ??
    null;
  const selectedRemoteHistoryBackup = useMemo(
    () =>
      remoteBackupSync.history.find(
        (backup) => backup.snapshot_id === selectedRemoteHistorySnapshotId
      ) ?? remoteBackupSync.history[0] ?? null,
    [remoteBackupSync.history, selectedRemoteHistorySnapshotId]
  );
  const selectedRemoteHistoryPresentation = useMemo(
    () =>
      selectedRemoteHistoryBackup
        ? resolveRemoteBackupHistorySelectionPresentation(
            selectedRemoteHistoryBackup,
            latestRemoteHistorySnapshotId
          )
        : null,
    [latestRemoteHistorySnapshotId, selectedRemoteHistoryBackup]
  );
  const remoteBackupLocalSummary =
    remoteBackupSync.lastComparison?.local_snapshot.summary ?? null;
  const selectedRemoteHistoryComparisonPresentation = useMemo(
    () =>
      resolveRemoteBackupHistoryComparisonPresentation(
        remoteBackupLocalSummary,
        selectedRemoteHistoryBackup
      ),
    [remoteBackupLocalSummary, selectedRemoteHistoryBackup]
  );
  const remoteBackupHistorySummary = useMemo(
    () => formatRemoteBackupHistorySummary(remoteBackupSync.history),
    [remoteBackupSync.history]
  );
  const remoteBackupPulledPreviewPresentation = useMemo(
    () =>
      remoteBackupPullResult
        ? resolveRemoteBackupPulledPreviewPresentation({
            source: remoteBackupPullResult.pullSource,
            localSummary: remoteBackupPullResult.localSummaryAtPull,
            pulledBackup: remoteBackupPullResult.backup
          })
        : null,
    [remoteBackupPullResult]
  );
  const remoteBackupPulledPreviewGuardPresentation = useMemo(
    () =>
      remoteBackupPullResult
        ? resolveRemoteBackupPulledPreviewGuardPresentation({
            source: remoteBackupPullResult.pullSource,
            pulledSnapshotId: remoteBackupPullResult.backup.snapshot_id,
            selectedSnapshotId: selectedRemoteHistoryBackup?.snapshot_id ?? null
          })
        : null,
    [remoteBackupPullResult, selectedRemoteHistoryBackup]
  );
  const remoteBackupPulledConversationImpactPresentation = useMemo(
    () =>
      remoteBackupPullResult
        ? resolveRemoteBackupPulledConversationImpactPresentation({
            localEnvelopeAtPull: remoteBackupPullResult.localEnvelopeAtPull,
            pulledEnvelope: remoteBackupPullResult.backup.envelope
          })
        : null,
    [remoteBackupPullResult]
  );
  const importRollbackAnchorPresentation = useMemo(
    () =>
      importRollbackAnchor
        ? resolveImportRollbackAnchorPresentation(
            importRollbackAnchor,
            rollbackAnchorCurrentLocalEnvelope
          )
        : null,
    [importRollbackAnchor, rollbackAnchorCurrentLocalEnvelope]
  );
  const localMergeImportGuardPresentation = useMemo(
    () =>
      resolveImportActionGuardPresentation({
        scope: "local",
        mode: "merge",
        armed: localMergeImportArmed,
        hasRollbackAnchor: Boolean(importRollbackAnchor),
        anchorSourceLabel: importRollbackAnchorPresentation?.sourceLabel ?? null
      }),
    [
      importRollbackAnchor,
      importRollbackAnchorPresentation,
      localMergeImportArmed
    ]
  );
  const localReplaceImportGuardPresentation = useMemo(
    () =>
      resolveImportActionGuardPresentation({
        scope: "local",
        mode: "replace",
        armed: localReplaceImportArmed,
        hasRollbackAnchor: Boolean(importRollbackAnchor),
        anchorSourceLabel: importRollbackAnchorPresentation?.sourceLabel ?? null
      }),
    [
      importRollbackAnchor,
      importRollbackAnchorPresentation,
      localReplaceImportArmed
    ]
  );
  const remoteMergeImportGuardPresentation = useMemo(
    () =>
      resolveImportActionGuardPresentation({
        scope: "remote_pulled",
        mode: "merge",
        armed: remoteMergeImportArmed,
        hasRollbackAnchor: Boolean(importRollbackAnchor),
        anchorSourceLabel: importRollbackAnchorPresentation?.sourceLabel ?? null
      }),
    [
      importRollbackAnchor,
      importRollbackAnchorPresentation,
      remoteMergeImportArmed
    ]
  );
  const remoteReplaceImportGuardPresentation = useMemo(
    () =>
      resolveImportActionGuardPresentation({
        scope: "remote_pulled",
        mode: "replace",
        armed: remoteReplaceImportArmed,
        hasRollbackAnchor: Boolean(importRollbackAnchor),
        anchorSourceLabel: importRollbackAnchorPresentation?.sourceLabel ?? null
      }),
    [
      importRollbackAnchor,
      importRollbackAnchorPresentation,
      remoteReplaceImportArmed
    ]
  );
  const localImportGuardWarning = localMergeImportArmed
    ? localMergeImportGuardPresentation.warning
    : localReplaceImportArmed
      ? localReplaceImportGuardPresentation.warning
      : null;
  const remoteImportGuardWarning = remoteMergeImportArmed
    ? remoteMergeImportGuardPresentation.warning
    : remoteReplaceImportArmed
      ? remoteReplaceImportGuardPresentation.warning
      : null;

  useEffect(() => {
    if (remoteBackupSync.history.length === 0) {
      setSelectedRemoteHistorySnapshotId(null);
      return;
    }

    if (
      selectedRemoteHistorySnapshotId &&
      remoteBackupSync.history.some(
        (backup) => backup.snapshot_id === selectedRemoteHistorySnapshotId
      )
    ) {
      return;
    }

    setSelectedRemoteHistorySnapshotId(
      remoteBackupSync.history[0]?.snapshot_id ?? null
    );
  }, [remoteBackupSync.history, selectedRemoteHistorySnapshotId]);

  useEffect(() => {
    setLocalMergeImportArmed(false);
    setLocalReplaceImportArmed(false);
  }, [pendingBackupFile, backupInspection]);

  useEffect(() => {
    setRemoteMergeImportArmed(false);
    setRemoteReplaceImportArmed(false);
  }, [remoteBackupPullResult, remoteBackupPulledPreviewGuardPresentation?.importEnabled]);

  useEffect(() => {
    setLocalMergeImportArmed(false);
    setLocalReplaceImportArmed(false);
    setRemoteMergeImportArmed(false);
    setRemoteReplaceImportArmed(false);
  }, [importRollbackAnchor]);

  useEffect(() => {
    if (!input.open) {
      return;
    }

    let cancelled = false;

    void loadBackupModule().then((backup) => {
      if (!cancelled) {
        setImportRollbackAnchor(backup.readImportRollbackAnchor());
      }
    });

    return () => {
      cancelled = true;
    };
  }, [input.open]);

  useEffect(() => {
    if (!input.open || !importRollbackAnchor) {
      setRollbackAnchorCurrentLocalEnvelope(null);
      return;
    }

    if (importRollbackAnchor.resultEnvelope) {
      setRollbackAnchorCurrentLocalEnvelope(importRollbackAnchor.resultEnvelope);
    } else {
      setRollbackAnchorCurrentLocalEnvelope(null);
    }

    let cancelled = false;

    void loadBackupModule()
      .then((backup) => backup.exportCurrentAppBackupEnvelope())
      .then((envelope) => {
        if (!cancelled) {
          setRollbackAnchorCurrentLocalEnvelope(envelope);
        }
      })
      .catch(() => {
        if (!cancelled && !importRollbackAnchor.resultEnvelope) {
          setRollbackAnchorCurrentLocalEnvelope(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [importRollbackAnchor, input.open]);

  const handleExportBackup = async () => {
    const backup = await loadBackupModule();
    const blob = await backup.exportCurrentAppBackup();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = backup.BACKUP_FILENAME;
    anchor.click();
    URL.revokeObjectURL(url);
    setBackupMessage("备份已导出");
  };

  const handleImportBackupSelect: ChangeEventHandler<HTMLInputElement> = async (
    event
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const backup = await loadBackupModule();
      const inspected = await backup.inspectBackup(file);
      setPendingBackupFile(file);
      setBackupInspection(inspected);
      setBackupMessage("已读取备份文件，请选择导入策略");
    } catch {
      setPendingBackupFile(null);
      setBackupInspection(null);
      setBackupMessage("备份读取失败，请检查文件格式");
    } finally {
      event.target.value = "";
    }
  };

  const handleImportBackup = async (mode: BackupImportMode) => {
    if (!pendingBackupFile) {
      return;
    }

    setLocalMergeImportArmed(false);
    setLocalReplaceImportArmed(false);

    try {
      const backup = await loadBackupModule();
      const anchor = await backup.captureCurrentAppImportRollbackAnchor({
        source: "local_file",
        importMode: mode,
        sourceDetail: pendingBackupFile.name
      });
      setImportRollbackAnchor(anchor);
    } catch (error) {
      setBackupMessage(
        error instanceof Error
          ? error.message
          : "导入前恢复锚点创建失败，本次导入已取消"
      );
      return;
    }

    setImportingBackup(true);
    setRemoteSyncImportInProgress(true);
    try {
      const backup = await loadBackupModule();
      await backup.importAppBackupToLocalStorage(pendingBackupFile, { mode });
      const updatedAnchor = await backup.recordCurrentAppImportRollbackResult();
      setImportRollbackAnchor(updatedAnchor);
      if (updatedAnchor.resultEnvelope) {
        setRollbackAnchorCurrentLocalEnvelope(updatedAnchor.resultEnvelope);
      }
      setBackupMessage(
        mode === "merge"
          ? "备份合并导入成功，正在刷新"
          : "备份覆盖导入成功，正在刷新"
      );
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch {
      setBackupMessage("备份导入失败，请检查文件格式");
    } finally {
      setRemoteSyncImportInProgress(false);
      setImportingBackup(false);
    }
  };

  const handleRestoreImportRollbackAnchor = async () => {
    setLocalMergeImportArmed(false);
    setLocalReplaceImportArmed(false);
    setRemoteMergeImportArmed(false);
    setRemoteReplaceImportArmed(false);
    setRollbackAnchorBusy(true);
    setRemoteSyncImportInProgress(true);
    try {
      const backup = await loadBackupModule();
      await backup.restoreImportRollbackAnchorToLocalStorage();
      setImportRollbackAnchor(null);
      setRollbackAnchorCurrentLocalEnvelope(null);
      setBackupMessage("已恢复到导入前本地状态，正在刷新");
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (error) {
      const backup = await loadBackupModule();
      setImportRollbackAnchor(backup.readImportRollbackAnchor());
      setBackupMessage(
        error instanceof Error ? error.message : "恢复导入前本地状态失败"
      );
    } finally {
      setRemoteSyncImportInProgress(false);
      setRollbackAnchorBusy(false);
    }
  };

  const handleClearImportRollbackAnchor = async () => {
    setLocalMergeImportArmed(false);
    setLocalReplaceImportArmed(false);
    setRemoteMergeImportArmed(false);
    setRemoteReplaceImportArmed(false);
    const backup = await loadBackupModule();
    backup.clearImportRollbackAnchor();
    setImportRollbackAnchor(null);
    setRollbackAnchorCurrentLocalEnvelope(null);
    setBackupMessage("已清除此恢复锚点");
  };

  const handleSaveRemoteBackupAdminToken = async () => {
    const token = remoteBackupAdminTokenDraft.trim();
    if (!token) {
      setBackupMessage("请输入网关管理员令牌");
      return;
    }

    setRemoteBackupBusyAction("save-token");
    try {
      await setRemoteBackupAdminToken(token);
      setRemoteBackupAdminTokenDraft("");
      setBackupMessage("网关管理员令牌已保存");
    } catch (error) {
      setBackupMessage(
        error instanceof Error ? error.message : "管理员令牌保存失败"
      );
    } finally {
      setRemoteBackupBusyAction(null);
    }
  };

  const handleUploadRemoteBackup = async (mode: "guarded" | "force" = "guarded") => {
    if (!remoteBackupActions.upload.enabled || !remoteBackupActions.gatewayProfile) {
      setBackupMessage(
        remoteBackupActions.upload.reason ?? "当前无法上传到网关"
      );
      return;
    }

    if (
      mode === "guarded" &&
      shouldEscalateManualRemoteOverwrite(remoteBackupSync.status) &&
      remoteBackupSync.lastComparison
    ) {
      setRemoteBackupSyncResult({
        status: "force_upload_required",
        latestRemoteBackup: remoteBackupSync.latestRemoteBackup,
        comparison: remoteBackupSync.lastComparison,
        checkedAt: new Date().toISOString()
      });
      setBackupMessage(
        "默认上传不会自动覆盖当前云端快照；如确认本地为准，请点击“仍然覆盖云端快照”。"
      );
      return;
    }

    setRemoteBackupBusyAction(mode === "force" ? "force-upload" : "upload");
    beginRemoteBackupSyncUpload();
    try {
      const adminToken = await readRemoteBackupAdminToken();
      if (!adminToken) {
        throw new Error("请先保存网关管理员令牌");
      }

      const backup = await loadBackupModule();
      const envelope = await backup.exportCurrentAppBackupEnvelope();
      const localSummary =
        remoteBackupSync.lastComparison?.local_snapshot.summary ??
        createComparableSummaryFromBackupEnvelope(envelope);
      if (mode === "guarded") {
        const guardedResponse = await uploadGatewayBackupGuarded({
          baseUrl: remoteBackupActions.gatewayProfile.baseUrl,
          adminToken,
          envelope,
          expectedRemoteSnapshotId:
            remoteBackupSync.latestRemoteBackup?.snapshot_id ?? null,
          expectedRemoteChecksum: remoteBackupSync.latestRemoteBackup?.checksum
        });

        if (guardedResponse.guarded_write === "conflict") {
          const historyResponse = await fetchGatewayBackupHistory({
            baseUrl: remoteBackupActions.gatewayProfile.baseUrl,
            adminToken,
            limit: 5
          }).catch(() => ({
            history: remoteBackupSync.history,
            build: guardedResponse.build
          }));

          setRemoteBackupSyncResult({
            status: "force_upload_required",
            latestRemoteBackup:
              historyResponse.history[0] ??
              guardedResponse.actual_remote_snapshot?.summary ??
              remoteBackupSync.latestRemoteBackup,
            history: historyResponse.history,
            comparison: createRemoteBackupGuardedConflictComparison({
              localSummary,
              response: guardedResponse,
              fallbackRemoteBackup: remoteBackupSync.latestRemoteBackup
            }),
            checkedAt: new Date().toISOString()
          });
          setBackupMessage(
            "云端快照已变化，默认上传未覆盖；如确认本地为准，请点击“仍然覆盖云端快照”。"
          );
          return;
        }

        setRemoteBackupSyncResult({
          latestRemoteBackup: guardedResponse.backup,
          history: [guardedResponse.backup],
          comparison: createRemoteBackupIdenticalComparison({
            localSummary,
            remoteBackup: guardedResponse.backup,
            build: guardedResponse.build
          }),
          checkedAt: new Date().toISOString()
        });
        setBackupMessage(
          formatRemoteBackupActionMessage("push", guardedResponse.backup)
        );
        return;
      }

      const response = await uploadGatewayBackup({
        baseUrl: remoteBackupActions.gatewayProfile.baseUrl,
        adminToken,
        envelope
      });

      setBackupMessage(formatRemoteBackupActionMessage("push", response.backup));
      setRemoteBackupSyncResult({
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
      setRemoteBackupSyncError(message);
      setBackupMessage(message);
    } finally {
      setRemoteBackupBusyAction(null);
    }
  };

  const handleCheckRemoteBackupSync = async () => {
    if (!remoteBackupActions.check.enabled || !remoteBackupActions.gatewayProfile) {
      setBackupMessage(
        remoteBackupActions.check.reason ?? "当前无法检查云端状态"
      );
      return;
    }

    setRemoteBackupBusyAction("check");
    beginRemoteBackupSyncCheck();
    try {
      const adminToken = await readRemoteBackupAdminToken();
      if (!adminToken) {
        throw new Error("请先保存网关管理员令牌");
      }

      const backup = await loadBackupModule();
      const envelope = await backup.exportCurrentAppBackupEnvelope();
      const localSummary = createComparableSummaryFromBackupEnvelope(envelope);
      const [historyResponse, comparison] = await Promise.all([
        fetchGatewayBackupHistory({
          baseUrl: remoteBackupActions.gatewayProfile.baseUrl,
          adminToken,
          limit: 5
        }),
        compareGatewayBackup({
          baseUrl: remoteBackupActions.gatewayProfile.baseUrl,
          adminToken,
          localSummary
        })
      ]);

      setRemoteBackupSyncResult({
        latestRemoteBackup:
          historyResponse.history[0] ?? comparison.remote_snapshot?.summary ?? null,
        history: historyResponse.history,
        comparison,
        checkedAt: new Date().toISOString()
      });
      setBackupMessage("云端状态检查完成");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "检查云端状态失败";
      setRemoteBackupSyncError(message);
      setBackupMessage(message);
    } finally {
      setRemoteBackupBusyAction(null);
    }
  };

  const handlePullRemoteBackup = async (snapshotId?: string) => {
    if (!remoteBackupActions.pull.enabled || !remoteBackupActions.gatewayProfile) {
      setBackupMessage(remoteBackupActions.pull.reason ?? "当前无法从网关拉取");
      return;
    }

    setRemoteBackupBusyAction("pull");
    try {
      const adminToken = await readRemoteBackupAdminToken();
      if (!adminToken) {
        throw new Error("请先保存网关管理员令牌");
      }

      const backup = await loadBackupModule();
      const envelope = await backup.exportCurrentAppBackupEnvelope();
      const localSummary =
        remoteBackupSync.lastComparison?.local_snapshot.summary ??
        createComparableSummaryFromBackupEnvelope(envelope);
      const response = await downloadGatewayBackup({
        baseUrl: remoteBackupActions.gatewayProfile.baseUrl,
        adminToken,
        snapshotId
      });
      setRemoteBackupPullResult({
        ...response,
        pullSource: snapshotId ? "selected_history" : "latest",
        localSummaryAtPull: localSummary,
        localEnvelopeAtPull: envelope
      });
      setBackupMessage(
        snapshotId
          ? formatRemoteBackupSelectedPullMessage(response.backup)
          : formatRemoteBackupActionMessage("pull", response.backup)
      );
    } catch (error) {
      setBackupMessage(
        error instanceof Error ? error.message : "从网关拉取失败"
      );
    } finally {
      setRemoteBackupBusyAction(null);
    }
  };

  const handleUpdateRemoteBackupProtection = async (
    action: "protect" | "unprotect"
  ) => {
    if (!selectedRemoteHistoryBackup) {
      setBackupMessage("请先选择一个云端保留快照");
      return;
    }

    if (!remoteBackupActions.check.enabled || !remoteBackupActions.gatewayProfile) {
      setBackupMessage(
        remoteBackupActions.check.reason ?? "当前无法更新快照保护状态"
      );
      return;
    }

    setRemoteBackupBusyAction(action);
    try {
      const adminToken = await readRemoteBackupAdminToken();
      if (!adminToken) {
        throw new Error("请先保存网关管理员令牌");
      }

      if (action === "protect") {
        const response = await protectGatewayBackupSnapshot({
          baseUrl: remoteBackupActions.gatewayProfile.baseUrl,
          adminToken,
          snapshotId: selectedRemoteHistoryBackup.snapshot_id
        });

        if (response.protection_status === "limit_reached") {
          setBackupMessage(formatRemoteBackupProtectionLimitMessage(response));
          return;
        }

        applyRemoteBackupSnapshotUpdate(response.backup);
        setRemoteBackupPullResult((current) =>
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
        setBackupMessage(
          formatRemoteBackupProtectionActionMessage("protect", response.backup)
        );
        return;
      }

      const response = await unprotectGatewayBackupSnapshot({
        baseUrl: remoteBackupActions.gatewayProfile.baseUrl,
        adminToken,
        snapshotId: selectedRemoteHistoryBackup.snapshot_id
      });

      applyRemoteBackupSnapshotUpdate(response.backup);
      setRemoteBackupPullResult((current) =>
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
      setBackupMessage(
        formatRemoteBackupProtectionActionMessage("unprotect", response.backup)
      );
    } catch (error) {
      setBackupMessage(
        error instanceof Error
          ? error.message
          : action === "protect"
            ? "保护快照失败"
            : "取消保护失败"
      );
    } finally {
      setRemoteBackupBusyAction(null);
    }
  };

  const handleImportPulledRemoteBackup = async (mode: BackupImportMode) => {
    if (!remoteBackupPullResult) {
      setBackupMessage(remoteBackupActions.restore.reason ?? "请先从网关拉取最新备份");
      return;
    }

    setRemoteMergeImportArmed(false);
    setRemoteReplaceImportArmed(false);

    try {
      const backup = await loadBackupModule();
      const anchor = await backup.captureCurrentAppImportRollbackAnchor({
        source:
          remoteBackupPullResult.pullSource === "latest"
            ? "remote_latest"
            : "remote_selected_history",
        importMode: mode,
        sourceDetail: remoteBackupPullResult.backup.snapshot_id
      });
      setImportRollbackAnchor(anchor);
    } catch (error) {
      setBackupMessage(
        error instanceof Error
          ? error.message
          : "导入前恢复锚点创建失败，本次导入已取消"
      );
      return;
    }

    setRemoteBackupBusyAction(`restore-${mode}`);
    setRemoteSyncImportInProgress(true);
    try {
      const backup = await loadBackupModule();
      await backup.importRemoteBackupToLocalStorage(remoteBackupPullResult.backup, {
        mode
      });
      const updatedAnchor = await backup.recordCurrentAppImportRollbackResult();
      setImportRollbackAnchor(updatedAnchor);
      if (updatedAnchor.resultEnvelope) {
        setRollbackAnchorCurrentLocalEnvelope(updatedAnchor.resultEnvelope);
      }
      setBackupMessage(
        mode === "merge"
          ? "已将网关备份合并导入，正在刷新"
          : "已用网关备份覆盖本地数据，正在刷新"
      );
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (error) {
      setBackupMessage(
        error instanceof Error ? error.message : "导入网关备份失败"
      );
    } finally {
      setRemoteSyncImportInProgress(false);
      setRemoteBackupBusyAction(null);
    }
  };

  const handleLocalMergeImport = () => {
    if (localMergeImportGuardPresentation.shouldArmFirst) {
      setLocalReplaceImportArmed(false);
      setLocalMergeImportArmed(true);
      return;
    }

    setLocalMergeImportArmed(false);
    setLocalReplaceImportArmed(false);
    void handleImportBackup("merge");
  };

  const handleLocalReplaceImport = () => {
    if (localReplaceImportGuardPresentation.shouldArmFirst) {
      setLocalMergeImportArmed(false);
      setLocalReplaceImportArmed(true);
      return;
    }

    setLocalMergeImportArmed(false);
    setLocalReplaceImportArmed(false);
    void handleImportBackup("replace");
  };

  const handleCancelLocalImport = () => {
    setLocalMergeImportArmed(false);
    setLocalReplaceImportArmed(false);
    setPendingBackupFile(null);
    setBackupInspection(null);
    setBackupMessage("已取消本次导入");
  };

  const handleToggleSelectedRemoteHistoryProtection = () => {
    if (!selectedRemoteHistoryBackup) {
      return;
    }

    void handleUpdateRemoteBackupProtection(
      selectedRemoteHistoryBackup.is_protected ? "unprotect" : "protect"
    );
  };

  const handlePullSelectedRemoteHistory = () => {
    if (!selectedRemoteHistoryBackup) {
      return;
    }

    void handlePullRemoteBackup(selectedRemoteHistoryBackup.snapshot_id);
  };

  const handleClearRemoteBackupAdminTokenAction = () => {
    clearRemoteBackupAdminToken();
    setRemoteBackupAdminTokenDraft("");
    setBackupMessage("已清除网关管理员令牌");
  };

  const handleRemoteMergeImport = () => {
    if (remoteMergeImportGuardPresentation.shouldArmFirst) {
      setRemoteReplaceImportArmed(false);
      setRemoteMergeImportArmed(true);
      return;
    }

    setRemoteMergeImportArmed(false);
    setRemoteReplaceImportArmed(false);
    void handleImportPulledRemoteBackup("merge");
  };

  const handleRemoteReplaceImport = () => {
    if (remoteReplaceImportGuardPresentation.shouldArmFirst) {
      setRemoteMergeImportArmed(false);
      setRemoteReplaceImportArmed(true);
      return;
    }

    setRemoteMergeImportArmed(false);
    setRemoteReplaceImportArmed(false);
    void handleImportPulledRemoteBackup("replace");
  };

  const handleClearRemotePullResult = () => {
    setRemoteMergeImportArmed(false);
    setRemoteReplaceImportArmed(false);
    setRemoteBackupPullResult(null);
    setBackupMessage("已清除本次网关拉取结果");
  };

  return {
    backupInputRef,
    pendingBackupFile,
    backupInspection,
    localImportGuardWarning,
    importingBackup,
    localMergeImportGuardPresentation,
    localReplaceImportGuardPresentation,
    localReplaceImportArmed,
    importRollbackAnchorCapturedAt: importRollbackAnchor?.capturedAt ?? null,
    importRollbackAnchorPresentation,
    rollbackAnchorBusy,
    remoteBackupBusyAction,
    remoteBackupAdminTokenDraft,
    remoteBackupAdminTokenSaved: Boolean(remoteBackupAdminTokenCipher),
    remoteBackupSyncMode: remoteBackupSyncPreferences.mode,
    remoteBackupActions,
    remoteBackupSync,
    remoteBackupSyncPresentation,
    remoteBackupHistorySummary,
    latestRemoteHistorySnapshotId,
    selectedRemoteHistoryBackup,
    selectedRemoteHistoryPresentation,
    selectedRemoteHistoryComparisonPresentation,
    remoteBackupLocalSummary,
    remoteBackupPullResult,
    remoteBackupPulledPreviewPresentation,
    remoteBackupPulledPreviewGuardPresentation,
    remoteBackupPulledConversationImpactPresentation,
    remoteImportGuardWarning,
    remoteMergeImportGuardPresentation,
    remoteReplaceImportGuardPresentation,
    remoteReplaceImportArmed,
    backupMessage,
    onExportBackup: () => {
      void handleExportBackup();
    },
    onLocalMergeImport: handleLocalMergeImport,
    onLocalReplaceImport: handleLocalReplaceImport,
    onCancelLocalImport: handleCancelLocalImport,
    onRestoreImportRollbackAnchor: () => {
      void handleRestoreImportRollbackAnchor();
    },
    onClearImportRollbackAnchor: () => {
      void handleClearImportRollbackAnchor();
    },
    onRemoteBackupAdminTokenDraftChange: setRemoteBackupAdminTokenDraft,
    onRemoteBackupSyncModeChange: setRemoteBackupSyncMode,
    onSelectRemoteHistorySnapshot: setSelectedRemoteHistorySnapshotId,
    onToggleRemoteHistoryProtection: handleToggleSelectedRemoteHistoryProtection,
    onPullSelectedHistorySnapshot: handlePullSelectedRemoteHistory,
    onSaveRemoteBackupAdminToken: () => {
      void handleSaveRemoteBackupAdminToken();
    },
    onClearRemoteBackupAdminToken: handleClearRemoteBackupAdminTokenAction,
    onCheckRemoteBackupSync: () => {
      void handleCheckRemoteBackupSync();
    },
    onUploadRemoteBackup: () => {
      void handleUploadRemoteBackup();
    },
    onPullLatestRemoteBackup: () => {
      void handlePullRemoteBackup();
    },
    onForceUploadRemoteBackup: () => {
      void handleUploadRemoteBackup("force");
    },
    onRemoteMergeImport: handleRemoteMergeImport,
    onRemoteReplaceImport: handleRemoteReplaceImport,
    onClearRemotePullResult: handleClearRemotePullResult,
    onBackupInputChange: handleImportBackupSelect
  };
};
