import { type ChangeEventHandler, useEffect, useMemo, useRef, useState } from "react";

import { useSettingsStore } from "../../state/settings-store";
import type {
  BackupEnvelope,
  BackupInspection,
  ImportRollbackAnchor
} from "../../storage/backup";
import { setRemoteSyncImportInProgress } from "../../storage/remote-sync";
import { buildRemoteBackupDerivedState } from "./remote-backup/derived-state";
import { createRemoteBackupImportActions } from "./remote-backup/import-actions";
import { loadBackupModule } from "./remote-backup/load-backup-module";
import {
  createRemoteBackupSyncActions,
  type RemoteBackupPulledResult
} from "./remote-backup/sync-actions";

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

  const derivedState = useMemo(
    () =>
      buildRemoteBackupDerivedState({
        runtimeProfiles,
        defaultRuntimeProfileId,
        remoteBackupAdminTokenCipher,
        remoteBackupSync,
        remoteBackupPullResult,
        selectedRemoteHistorySnapshotId,
        importRollbackAnchor,
        rollbackAnchorCurrentLocalEnvelope,
        localMergeImportArmed,
        localReplaceImportArmed,
        remoteMergeImportArmed,
        remoteReplaceImportArmed
      }),
    [
      defaultRuntimeProfileId,
      importRollbackAnchor,
      localMergeImportArmed,
      localReplaceImportArmed,
      remoteBackupAdminTokenCipher,
      remoteBackupPullResult,
      remoteBackupSync,
      remoteMergeImportArmed,
      remoteReplaceImportArmed,
      rollbackAnchorCurrentLocalEnvelope,
      runtimeProfiles,
      selectedRemoteHistorySnapshotId
    ]
  );

  const syncActions = createRemoteBackupSyncActions({
    loadBackupModule,
    remoteBackupActions: derivedState.remoteBackupActions,
    remoteBackupSync,
    selectedRemoteHistoryBackup: derivedState.selectedRemoteHistoryBackup,
    readRemoteBackupAdminToken,
    beginRemoteBackupSyncCheck,
    beginRemoteBackupSyncUpload,
    setRemoteBackupSyncResult,
    setRemoteBackupSyncError,
    applyRemoteBackupSnapshotUpdate,
    setRemoteBackupBusyAction,
    setBackupMessage,
    setRemoteBackupPullResult
  });

  const importActions = createRemoteBackupImportActions({
    loadBackupModule,
    pendingBackupFile,
    remoteBackupPullResult,
    restoreUnavailableMessage: derivedState.remoteBackupActions.restore.reason,
    setPendingBackupFile,
    setBackupInspection,
    setImportRollbackAnchor,
    setRollbackAnchorCurrentLocalEnvelope,
    setImportingBackup,
    setRollbackAnchorBusy,
    setRemoteSyncImportInProgress,
    setBackupMessage,
    setLocalMergeImportArmed,
    setLocalReplaceImportArmed,
    setRemoteMergeImportArmed,
    setRemoteReplaceImportArmed,
    setRemoteBackupBusyAction,
    scheduleReload: () => {
      setTimeout(() => {
        window.location.reload();
      }, 300);
    }
  });

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
  }, [
    remoteBackupPullResult,
    derivedState.remoteBackupPulledPreviewGuardPresentation?.importEnabled
  ]);

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

  const handleImportBackupSelect: ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void importActions.handleImportBackupSelection(file);
    event.target.value = "";
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

  const handleLocalMergeImport = () => {
    if (derivedState.localMergeImportGuardPresentation.shouldArmFirst) {
      setLocalReplaceImportArmed(false);
      setLocalMergeImportArmed(true);
      return;
    }

    setLocalMergeImportArmed(false);
    setLocalReplaceImportArmed(false);
    void importActions.handleImportBackup("merge");
  };

  const handleLocalReplaceImport = () => {
    if (derivedState.localReplaceImportGuardPresentation.shouldArmFirst) {
      setLocalMergeImportArmed(false);
      setLocalReplaceImportArmed(true);
      return;
    }

    setLocalMergeImportArmed(false);
    setLocalReplaceImportArmed(false);
    void importActions.handleImportBackup("replace");
  };

  const handleCancelLocalImport = () => {
    setLocalMergeImportArmed(false);
    setLocalReplaceImportArmed(false);
    setPendingBackupFile(null);
    setBackupInspection(null);
    setBackupMessage("已取消本次导入");
  };

  const handleToggleSelectedRemoteHistoryProtection = () => {
    if (!derivedState.selectedRemoteHistoryBackup) {
      return;
    }

    void syncActions.handleUpdateRemoteBackupProtection(
      derivedState.selectedRemoteHistoryBackup.is_protected ? "unprotect" : "protect"
    );
  };

  const handlePullSelectedRemoteHistory = () => {
    if (!derivedState.selectedRemoteHistoryBackup) {
      return;
    }

    void syncActions.handlePullRemoteBackup(
      derivedState.selectedRemoteHistoryBackup.snapshot_id
    );
  };

  const handleClearRemoteBackupAdminTokenAction = () => {
    clearRemoteBackupAdminToken();
    setRemoteBackupAdminTokenDraft("");
    setBackupMessage("已清除网关管理员令牌");
  };

  const handleRemoteMergeImport = () => {
    if (derivedState.remoteMergeImportGuardPresentation.shouldArmFirst) {
      setRemoteReplaceImportArmed(false);
      setRemoteMergeImportArmed(true);
      return;
    }

    setRemoteMergeImportArmed(false);
    setRemoteReplaceImportArmed(false);
    void importActions.handleImportPulledRemoteBackup("merge");
  };

  const handleRemoteReplaceImport = () => {
    if (derivedState.remoteReplaceImportGuardPresentation.shouldArmFirst) {
      setRemoteMergeImportArmed(false);
      setRemoteReplaceImportArmed(true);
      return;
    }

    setRemoteMergeImportArmed(false);
    setRemoteReplaceImportArmed(false);
    void importActions.handleImportPulledRemoteBackup("replace");
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
    localImportGuardWarning: derivedState.localImportGuardWarning,
    importingBackup,
    localMergeImportGuardPresentation:
      derivedState.localMergeImportGuardPresentation,
    localReplaceImportGuardPresentation:
      derivedState.localReplaceImportGuardPresentation,
    localReplaceImportArmed,
    importRollbackAnchorCapturedAt: importRollbackAnchor?.capturedAt ?? null,
    importRollbackAnchorPresentation: derivedState.importRollbackAnchorPresentation,
    rollbackAnchorBusy,
    remoteBackupBusyAction,
    remoteBackupAdminTokenDraft,
    remoteBackupAdminTokenSaved: Boolean(remoteBackupAdminTokenCipher),
    remoteBackupSyncMode: remoteBackupSyncPreferences.mode,
    remoteBackupActions: derivedState.remoteBackupActions,
    remoteBackupSync,
    remoteBackupSyncPresentation: derivedState.remoteBackupSyncPresentation,
    remoteBackupHistorySummary: derivedState.remoteBackupHistorySummary,
    latestRemoteHistorySnapshotId: derivedState.latestRemoteHistorySnapshotId,
    selectedRemoteHistoryBackup: derivedState.selectedRemoteHistoryBackup,
    selectedRemoteHistoryPresentation:
      derivedState.selectedRemoteHistoryPresentation,
    selectedRemoteHistoryComparisonPresentation:
      derivedState.selectedRemoteHistoryComparisonPresentation,
    remoteBackupLocalSummary: derivedState.remoteBackupLocalSummary,
    remoteBackupPullResult,
    remoteBackupPulledPreviewPresentation:
      derivedState.remoteBackupPulledPreviewPresentation,
    remoteBackupPulledPreviewGuardPresentation:
      derivedState.remoteBackupPulledPreviewGuardPresentation,
    remoteBackupPulledConversationImpactPresentation:
      derivedState.remoteBackupPulledConversationImpactPresentation,
    remoteImportGuardWarning: derivedState.remoteImportGuardWarning,
    remoteMergeImportGuardPresentation:
      derivedState.remoteMergeImportGuardPresentation,
    remoteReplaceImportGuardPresentation:
      derivedState.remoteReplaceImportGuardPresentation,
    remoteReplaceImportArmed,
    backupMessage,
    onExportBackup: () => {
      void handleExportBackup();
    },
    onLocalMergeImport: handleLocalMergeImport,
    onLocalReplaceImport: handleLocalReplaceImport,
    onCancelLocalImport: handleCancelLocalImport,
    onRestoreImportRollbackAnchor: () => {
      void importActions.handleRestoreImportRollbackAnchor();
    },
    onClearImportRollbackAnchor: () => {
      void importActions.handleClearImportRollbackAnchor();
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
      void syncActions.handleCheckRemoteBackupSync();
    },
    onUploadRemoteBackup: () => {
      void syncActions.handleUploadRemoteBackup();
    },
    onPullLatestRemoteBackup: () => {
      void syncActions.handlePullRemoteBackup();
    },
    onForceUploadRemoteBackup: () => {
      void syncActions.handleUploadRemoteBackup("force");
    },
    onRemoteMergeImport: handleRemoteMergeImport,
    onRemoteReplaceImport: handleRemoteReplaceImport,
    onClearRemotePullResult: handleClearRemotePullResult,
    onBackupInputChange: handleImportBackupSelect
  };
};
