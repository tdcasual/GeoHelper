import type {
  BackupEnvelope,
  BackupImportMode,
  BackupInspection,
  ImportRollbackAnchor
} from "../../../storage/backup";
import type { BackupModule } from "./load-backup-module";
import type { RemoteBackupPulledResult } from "./sync-actions";

export interface RemoteBackupImportActionDeps {
  loadBackupModule: () => Promise<BackupModule>;
  pendingBackupFile: File | null;
  remoteBackupPullResult: RemoteBackupPulledResult | null;
  restoreUnavailableMessage: string | null;
  setPendingBackupFile: (file: File | null) => void;
  setBackupInspection: (inspection: BackupInspection | null) => void;
  setImportRollbackAnchor: (anchor: ImportRollbackAnchor | null) => void;
  setRollbackAnchorCurrentLocalEnvelope: (envelope: BackupEnvelope | null) => void;
  setImportingBackup: (value: boolean) => void;
  setRollbackAnchorBusy: (value: boolean) => void;
  setRemoteSyncImportInProgress: (value: boolean) => void;
  setBackupMessage: (message: string | null) => void;
  setLocalMergeImportArmed: (value: boolean) => void;
  setLocalReplaceImportArmed: (value: boolean) => void;
  setRemoteMergeImportArmed: (value: boolean) => void;
  setRemoteReplaceImportArmed: (value: boolean) => void;
  setRemoteBackupBusyAction: (action: string | null) => void;
  scheduleReload: () => void;
}

const resetLocalImportArming = (deps: RemoteBackupImportActionDeps): void => {
  deps.setLocalMergeImportArmed(false);
  deps.setLocalReplaceImportArmed(false);
};

const resetRemoteImportArming = (deps: RemoteBackupImportActionDeps): void => {
  deps.setRemoteMergeImportArmed(false);
  deps.setRemoteReplaceImportArmed(false);
};

const resetAllImportArming = (deps: RemoteBackupImportActionDeps): void => {
  resetLocalImportArming(deps);
  resetRemoteImportArming(deps);
};

export const createRemoteBackupImportActions = (deps: RemoteBackupImportActionDeps) => ({
  handleImportBackupSelection: async (file: File): Promise<void> => {
    try {
      const backup = await deps.loadBackupModule();
      const inspected = await backup.inspectBackup(file);
      deps.setPendingBackupFile(file);
      deps.setBackupInspection(inspected);
      deps.setBackupMessage("已读取备份文件，请选择导入策略");
    } catch {
      deps.setPendingBackupFile(null);
      deps.setBackupInspection(null);
      deps.setBackupMessage("备份读取失败，请检查文件格式");
    }
  },

  handleImportBackup: async (mode: BackupImportMode): Promise<void> => {
    if (!deps.pendingBackupFile) {
      return;
    }

    resetLocalImportArming(deps);

    try {
      const backup = await deps.loadBackupModule();
      const anchor = await backup.captureCurrentAppImportRollbackAnchor({
        source: "local_file",
        importMode: mode,
        sourceDetail: deps.pendingBackupFile.name
      });
      deps.setImportRollbackAnchor(anchor);
    } catch (error) {
      deps.setBackupMessage(
        error instanceof Error
          ? error.message
          : "导入前恢复锚点创建失败，本次导入已取消"
      );
      return;
    }

    deps.setImportingBackup(true);
    deps.setRemoteSyncImportInProgress(true);
    try {
      const backup = await deps.loadBackupModule();
      await backup.importAppBackupToLocalStorage(deps.pendingBackupFile, { mode });
      const updatedAnchor = await backup.recordCurrentAppImportRollbackResult();
      deps.setImportRollbackAnchor(updatedAnchor);
      if (updatedAnchor.resultEnvelope) {
        deps.setRollbackAnchorCurrentLocalEnvelope(updatedAnchor.resultEnvelope);
      }
      deps.setBackupMessage(
        mode === "merge"
          ? "备份合并导入成功，正在刷新"
          : "备份覆盖导入成功，正在刷新"
      );
      deps.scheduleReload();
    } catch {
      deps.setBackupMessage("备份导入失败，请检查文件格式");
    } finally {
      deps.setRemoteSyncImportInProgress(false);
      deps.setImportingBackup(false);
    }
  },

  handleRestoreImportRollbackAnchor: async (): Promise<void> => {
    resetAllImportArming(deps);
    deps.setRollbackAnchorBusy(true);
    deps.setRemoteSyncImportInProgress(true);
    try {
      const backup = await deps.loadBackupModule();
      await backup.restoreImportRollbackAnchorToLocalStorage();
      deps.setImportRollbackAnchor(null);
      deps.setRollbackAnchorCurrentLocalEnvelope(null);
      deps.setBackupMessage("已恢复到导入前本地状态，正在刷新");
      deps.scheduleReload();
    } catch (error) {
      const backup = await deps.loadBackupModule();
      deps.setImportRollbackAnchor(backup.readImportRollbackAnchor());
      deps.setBackupMessage(
        error instanceof Error ? error.message : "恢复导入前本地状态失败"
      );
    } finally {
      deps.setRemoteSyncImportInProgress(false);
      deps.setRollbackAnchorBusy(false);
    }
  },

  handleClearImportRollbackAnchor: async (): Promise<void> => {
    resetAllImportArming(deps);
    const backup = await deps.loadBackupModule();
    backup.clearImportRollbackAnchor();
    deps.setImportRollbackAnchor(null);
    deps.setRollbackAnchorCurrentLocalEnvelope(null);
    deps.setBackupMessage("已清除此恢复锚点");
  },

  handleImportPulledRemoteBackup: async (mode: BackupImportMode): Promise<void> => {
    if (!deps.remoteBackupPullResult) {
      deps.setBackupMessage(
        deps.restoreUnavailableMessage ?? "请先从网关拉取最新备份"
      );
      return;
    }

    resetRemoteImportArming(deps);

    try {
      const backup = await deps.loadBackupModule();
      const anchor = await backup.captureCurrentAppImportRollbackAnchor({
        source:
          deps.remoteBackupPullResult.pullSource === "latest"
            ? "remote_latest"
            : "remote_selected_history",
        importMode: mode,
        sourceDetail: deps.remoteBackupPullResult.backup.snapshot_id
      });
      deps.setImportRollbackAnchor(anchor);
    } catch (error) {
      deps.setBackupMessage(
        error instanceof Error
          ? error.message
          : "导入前恢复锚点创建失败，本次导入已取消"
      );
      return;
    }

    deps.setRemoteBackupBusyAction(`restore-${mode}`);
    deps.setRemoteSyncImportInProgress(true);
    try {
      const backup = await deps.loadBackupModule();
      await backup.importRemoteBackupToLocalStorage(deps.remoteBackupPullResult.backup, {
        mode
      });
      const updatedAnchor = await backup.recordCurrentAppImportRollbackResult();
      deps.setImportRollbackAnchor(updatedAnchor);
      if (updatedAnchor.resultEnvelope) {
        deps.setRollbackAnchorCurrentLocalEnvelope(updatedAnchor.resultEnvelope);
      }
      deps.setBackupMessage(
        mode === "merge"
          ? "已将网关备份合并导入，正在刷新"
          : "已用网关备份覆盖本地数据，正在刷新"
      );
      deps.scheduleReload();
    } catch (error) {
      deps.setBackupMessage(
        error instanceof Error ? error.message : "导入网关备份失败"
      );
    } finally {
      deps.setRemoteSyncImportInProgress(false);
      deps.setRemoteBackupBusyAction(null);
    }
  }
});
