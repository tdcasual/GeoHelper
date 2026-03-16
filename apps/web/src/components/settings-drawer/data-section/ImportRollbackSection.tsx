import type { SettingsDataSectionProps } from "../SettingsDataSection";

type ImportRollbackSectionProps = Pick<
  SettingsDataSectionProps,
  | "importRollbackAnchorCapturedAt"
  | "importRollbackAnchorPresentation"
  | "rollbackAnchorBusy"
  | "importingBackup"
  | "remoteBackupBusyAction"
  | "onRestoreImportRollbackAnchor"
  | "onClearImportRollbackAnchor"
>;

export const ImportRollbackSection = ({
  importRollbackAnchorCapturedAt,
  importRollbackAnchorPresentation,
  rollbackAnchorBusy,
  importingBackup,
  remoteBackupBusyAction,
  onRestoreImportRollbackAnchor,
  onClearImportRollbackAnchor
}: ImportRollbackSectionProps) => {
  if (!importRollbackAnchorPresentation) {
    return null;
  }

  const currentStateIsWarning =
    importRollbackAnchorPresentation.currentStateSummary ===
    "当前状态：本地已在这次导入后继续变化。";

  return (
    <article
      className="settings-import-preview"
      data-testid="import-rollback-anchor"
    >
      <p>{importRollbackAnchorPresentation.title}</p>
      <p>{`捕获时间：${new Date(importRollbackAnchorCapturedAt ?? "").toLocaleString("zh-CN")}`}</p>
      <p>{importRollbackAnchorPresentation.sourceLabel}</p>
      <p>{importRollbackAnchorPresentation.importModeLabel}</p>
      <p>{importRollbackAnchorPresentation.summary}</p>
      {importRollbackAnchorPresentation.resultSummary ? (
        <p>{importRollbackAnchorPresentation.resultSummary}</p>
      ) : null}
      {importRollbackAnchorPresentation.outcomeSummary ? (
        <p className="settings-hint">
          {importRollbackAnchorPresentation.outcomeSummary}
        </p>
      ) : null}
      {importRollbackAnchorPresentation.currentStateSummary ? (
        <p
          className={currentStateIsWarning ? "settings-warning-text" : "settings-hint"}
        >
          {importRollbackAnchorPresentation.currentStateSummary}
        </p>
      ) : null}
      <p className={currentStateIsWarning ? "settings-warning-text" : "settings-hint"}>
        {importRollbackAnchorPresentation.hint}
      </p>
      <div className="settings-inline-actions">
        <button
          type="button"
          disabled={rollbackAnchorBusy || importingBackup || Boolean(remoteBackupBusyAction)}
          onClick={onRestoreImportRollbackAnchor}
        >
          恢复到导入前状态
        </button>
        <button
          type="button"
          disabled={rollbackAnchorBusy || importingBackup || Boolean(remoteBackupBusyAction)}
          onClick={onClearImportRollbackAnchor}
        >
          清除此恢复锚点
        </button>
      </div>
    </article>
  );
};
