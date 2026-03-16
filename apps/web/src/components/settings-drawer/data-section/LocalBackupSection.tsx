import type { SettingsDataSectionProps } from "../SettingsDataSection";

type LocalBackupSectionProps = Pick<
  SettingsDataSectionProps,
  | "backupInputRef"
  | "pendingBackupFile"
  | "backupInspection"
  | "localImportGuardWarning"
  | "importingBackup"
  | "localMergeImportGuardPresentation"
  | "localReplaceImportGuardPresentation"
  | "localReplaceImportArmed"
  | "onExportBackup"
  | "onLocalMergeImport"
  | "onLocalReplaceImport"
  | "onCancelLocalImport"
>;

export const LocalBackupSection = ({
  backupInputRef,
  pendingBackupFile,
  backupInspection,
  localImportGuardWarning,
  importingBackup,
  localMergeImportGuardPresentation,
  localReplaceImportGuardPresentation,
  localReplaceImportArmed,
  onExportBackup,
  onLocalMergeImport,
  onLocalReplaceImport,
  onCancelLocalImport
}: LocalBackupSectionProps) => (
  <>
    <h3>备份与恢复</h3>
    <div className="settings-inline-actions">
      <button type="button" onClick={onExportBackup}>
        导出备份
      </button>
      <button type="button" onClick={() => backupInputRef.current?.click()}>
        导入备份
      </button>
    </div>
    {pendingBackupFile && backupInspection ? (
      <article className="settings-import-preview">
        <p>{`文件：${pendingBackupFile.name}`}</p>
        <p>{`schema：v${backupInspection.schemaVersion}`}</p>
        <p>{`创建时间：${new Date(backupInspection.createdAt).toLocaleString("zh-CN")}`}</p>
        <p>{`会话数：${backupInspection.conversationCount}`}</p>
        <p>{`来源版本：${backupInspection.appVersion}`}</p>
        {backupInspection.migrationHint === "older" ? (
          <p className="settings-warning-text">备份版本较旧，将按兼容方式导入</p>
        ) : null}
        {backupInspection.migrationHint === "newer" ? (
          <p className="settings-warning-text">
            备份版本高于当前应用，导入后可能存在字段降级
          </p>
        ) : null}
        {localImportGuardWarning ? (
          <p className="settings-warning-text">{localImportGuardWarning}</p>
        ) : null}
        <div className="settings-inline-actions">
          <button
            type="button"
            disabled={importingBackup}
            onClick={onLocalMergeImport}
          >
            {localMergeImportGuardPresentation.buttonLabel}
          </button>
          <button
            type="button"
            className={
              localReplaceImportGuardPresentation.danger && localReplaceImportArmed
                ? "top-bar-button-danger"
                : undefined
            }
            disabled={importingBackup}
            onClick={onLocalReplaceImport}
          >
            {localReplaceImportGuardPresentation.buttonLabel}
          </button>
          <button
            type="button"
            disabled={importingBackup}
            onClick={onCancelLocalImport}
          >
            取消
          </button>
        </div>
      </article>
    ) : null}
  </>
);
