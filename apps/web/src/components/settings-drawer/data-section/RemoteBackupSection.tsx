import { getRuntimeGatewayBaseUrl } from "../../../state/runtime-profiles";
import {
  formatRemoteBackupRestoreWarning,
  resolveRemoteBackupHistoryBadgePresentation,
  shouldRecommendRemoteHistoryResolution,
  shouldShowRemoteBackupForceUpload
} from "../../settings-remote-backup";
import type { SettingsDataSectionProps } from "../SettingsDataSection";

type RemoteBackupSectionProps = Pick<
  SettingsDataSectionProps,
  | "remoteBackupBusyAction"
  | "remoteBackupAdminTokenDraft"
  | "remoteBackupAdminTokenSaved"
  | "remoteBackupSyncMode"
  | "remoteBackupActions"
  | "remoteBackupSync"
  | "remoteBackupSyncPresentation"
  | "remoteBackupHistorySummary"
  | "latestRemoteHistorySnapshotId"
  | "selectedRemoteHistoryBackup"
  | "selectedRemoteHistoryPresentation"
  | "selectedRemoteHistoryComparisonPresentation"
  | "remoteBackupLocalSummary"
  | "remoteBackupPullResult"
  | "remoteBackupPulledPreviewPresentation"
  | "remoteBackupPulledPreviewGuardPresentation"
  | "remoteBackupPulledConversationImpactPresentation"
  | "remoteImportGuardWarning"
  | "remoteMergeImportGuardPresentation"
  | "remoteReplaceImportGuardPresentation"
  | "remoteReplaceImportArmed"
  | "onRemoteBackupAdminTokenDraftChange"
  | "onRemoteBackupSyncModeChange"
  | "onSelectRemoteHistorySnapshot"
  | "onToggleRemoteHistoryProtection"
  | "onPullSelectedHistorySnapshot"
  | "onSaveRemoteBackupAdminToken"
  | "onClearRemoteBackupAdminToken"
  | "onCheckRemoteBackupSync"
  | "onUploadRemoteBackup"
  | "onPullLatestRemoteBackup"
  | "onForceUploadRemoteBackup"
  | "onRemoteMergeImport"
  | "onRemoteReplaceImport"
  | "onClearRemotePullResult"
>;

export const RemoteBackupSection = ({
  remoteBackupBusyAction,
  remoteBackupAdminTokenDraft,
  remoteBackupAdminTokenSaved,
  remoteBackupSyncMode,
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
  onRemoteBackupAdminTokenDraftChange,
  onRemoteBackupSyncModeChange,
  onSelectRemoteHistorySnapshot,
  onToggleRemoteHistoryProtection,
  onPullSelectedHistorySnapshot,
  onSaveRemoteBackupAdminToken,
  onClearRemoteBackupAdminToken,
  onCheckRemoteBackupSync,
  onUploadRemoteBackup,
  onPullLatestRemoteBackup,
  onForceUploadRemoteBackup,
  onRemoteMergeImport,
  onRemoteReplaceImport,
  onClearRemotePullResult
}: RemoteBackupSectionProps) => (
  <section className="settings-section">
    <h3>网关远端备份</h3>
    <label>
      管理员令牌
      <input
        type="password"
        placeholder={
          remoteBackupAdminTokenSaved
            ? "已保存管理员令牌（重新输入可覆盖）"
            : "x-admin-token"
        }
        value={remoteBackupAdminTokenDraft}
        onChange={(event) => onRemoteBackupAdminTokenDraftChange(event.target.value)}
      />
    </label>
    <label>
      轻量云同步
      <select
        value={remoteBackupSyncMode}
        onChange={(event) =>
          onRemoteBackupSyncModeChange(event.target.value as typeof remoteBackupSyncMode)
        }
      >
        <option value="off">关闭</option>
        <option value="remind_only">仅提醒（启动检查）</option>
        <option value="delayed_upload">延迟上传</option>
      </select>
    </label>
    <p className="settings-hint">
      {remoteBackupActions.gatewayProfile
        ? `远端网关：${remoteBackupActions.gatewayProfile.name}（${getRuntimeGatewayBaseUrl(remoteBackupActions.gatewayProfile)}）`
        : remoteBackupActions.upload.reason}
    </p>
    <p className="settings-hint">
      启动检查只拉取元数据；延迟上传也不会自动拉取或自动导入。
    </p>
    <article
      className="settings-import-preview"
      data-testid="remote-backup-sync-status"
    >
      <p>{`同步状态：${remoteBackupSyncPresentation.statusLabel}`}</p>
      <p>{remoteBackupSyncPresentation.description}</p>
      {remoteBackupSyncPresentation.latestSummary ? (
        <p>{remoteBackupSyncPresentation.latestSummary}</p>
      ) : (
        <p>云端最新快照：尚未获取摘要</p>
      )}
      {remoteBackupSync.latestRemoteBackup ? (
        <p>{`快照 ID：${remoteBackupSync.latestRemoteBackup.snapshot_id}`}</p>
      ) : null}
      {remoteBackupSyncPresentation.checkedAtLabel ? (
        <p>{remoteBackupSyncPresentation.checkedAtLabel}</p>
      ) : null}
    </article>
    {remoteBackupSync.history.length > 0 ? (
      <article className="settings-import-preview" data-testid="remote-backup-history">
        <p>{remoteBackupHistorySummary}</p>
        <div className="settings-remote-backup-history-list">
          {remoteBackupSync.history.map((backup, index) => {
            const isSelected =
              backup.snapshot_id === selectedRemoteHistoryBackup?.snapshot_id;
            const isLatest =
              backup.snapshot_id === latestRemoteHistorySnapshotId || index === 0;
            const historyBadgePresentation =
              resolveRemoteBackupHistoryBadgePresentation(
                remoteBackupLocalSummary,
                backup
              );

            return (
              <button
                key={backup.snapshot_id}
                type="button"
                className={`settings-remote-backup-history-item${
                  isSelected
                    ? " settings-remote-backup-history-item-selected"
                    : ""
                }`}
                onClick={() => onSelectRemoteHistorySnapshot(backup.snapshot_id)}
              >
                <div className="settings-remote-backup-history-item-badges">
                  <span>{isLatest ? "最新" : "历史"}</span>
                  {backup.is_protected ? <span>已保护</span> : null}
                  {historyBadgePresentation ? (
                    <span
                      className={`settings-remote-backup-history-relation-badge settings-remote-backup-history-relation-badge-${historyBadgePresentation.relation}`}
                    >
                      {historyBadgePresentation.label}
                    </span>
                  ) : null}
                </div>
                <span>{`${backup.conversation_count} 个会话`}</span>
                <span>{backup.snapshot_id}</span>
              </button>
            );
          })}
        </div>
        {selectedRemoteHistoryPresentation ? (
          <div data-testid="remote-backup-selected-history">
            <p>{selectedRemoteHistoryPresentation.statusLabel}</p>
            <p>{selectedRemoteHistoryPresentation.snapshotIdLabel}</p>
            <p>{selectedRemoteHistoryPresentation.deviceIdLabel}</p>
            <p>{selectedRemoteHistoryPresentation.updatedAtLabel}</p>
            <p>{selectedRemoteHistoryPresentation.conversationCountLabel}</p>
            <p>{selectedRemoteHistoryPresentation.protectionLabel}</p>
            {selectedRemoteHistoryPresentation.protectedAtLabel ? (
              <p>{selectedRemoteHistoryPresentation.protectedAtLabel}</p>
            ) : null}
            {selectedRemoteHistoryComparisonPresentation ? (
              <>
                <p>{selectedRemoteHistoryComparisonPresentation.relationLabel}</p>
                <p>{selectedRemoteHistoryComparisonPresentation.recommendation}</p>
              </>
            ) : null}
            {shouldRecommendRemoteHistoryResolution(remoteBackupSync.status) ? (
              <p className="settings-hint">
                建议先拉取当前选中的快照预览；如这是关键恢复点，可先保护当前选中的快照，再决定合并、覆盖或仍然覆盖云端。
              </p>
            ) : null}
          </div>
        ) : null}
        {selectedRemoteHistoryBackup ? (
          <div className="settings-inline-actions">
            <button
              type="button"
              disabled={Boolean(remoteBackupBusyAction) || !remoteBackupActions.check.enabled}
              onClick={onToggleRemoteHistoryProtection}
            >
              {selectedRemoteHistoryBackup.is_protected ? "取消保护" : "保护此快照"}
            </button>
            {selectedRemoteHistoryBackup.snapshot_id !== latestRemoteHistorySnapshotId ? (
              <button
                type="button"
                disabled={Boolean(remoteBackupBusyAction) || !remoteBackupActions.pull.enabled}
                onClick={onPullSelectedHistorySnapshot}
              >
                拉取所选历史快照
              </button>
            ) : null}
          </div>
        ) : null}
      </article>
    ) : null}
    {!remoteBackupActions.upload.enabled && remoteBackupActions.upload.reason ? (
      <p className="settings-warning-text">{remoteBackupActions.upload.reason}</p>
    ) : null}
    <div className="settings-inline-actions">
      <button
        type="button"
        disabled={Boolean(remoteBackupBusyAction) || !remoteBackupAdminTokenDraft.trim()}
        onClick={onSaveRemoteBackupAdminToken}
      >
        保存管理员令牌
      </button>
      <button
        type="button"
        disabled={Boolean(remoteBackupBusyAction) || !remoteBackupAdminTokenSaved}
        onClick={onClearRemoteBackupAdminToken}
      >
        清除管理员令牌
      </button>
    </div>
    <div className="settings-inline-actions">
      <button
        type="button"
        disabled={Boolean(remoteBackupBusyAction) || !remoteBackupActions.check.enabled}
        onClick={onCheckRemoteBackupSync}
      >
        检查云端状态
      </button>
      <button
        type="button"
        disabled={Boolean(remoteBackupBusyAction) || !remoteBackupActions.upload.enabled}
        onClick={onUploadRemoteBackup}
      >
        上传最新快照
      </button>
      <button
        type="button"
        disabled={Boolean(remoteBackupBusyAction) || !remoteBackupActions.pull.enabled}
        onClick={onPullLatestRemoteBackup}
      >
        拉取最新快照
      </button>
    </div>
    {shouldShowRemoteBackupForceUpload(remoteBackupSync.status) &&
    remoteBackupActions.upload.enabled ? (
      <div className="settings-inline-actions">
        <button
          type="button"
          className="top-bar-button-danger"
          disabled={Boolean(remoteBackupBusyAction)}
          onClick={onForceUploadRemoteBackup}
        >
          仍然覆盖云端快照
        </button>
      </div>
    ) : null}
    {remoteBackupPullResult ? (
      <article
        className="settings-import-preview"
        data-testid="remote-backup-pulled-preview"
      >
        <p>{`拉取时间：${new Date(remoteBackupPullResult.backup.stored_at).toLocaleString("zh-CN")}`}</p>
        <p>{`schema：v${remoteBackupPullResult.backup.schema_version}`}</p>
        <p>{`创建时间：${new Date(remoteBackupPullResult.backup.created_at).toLocaleString("zh-CN")}`}</p>
        <p>{`快照 ID：${remoteBackupPullResult.backup.snapshot_id}`}</p>
        <p>{`设备 ID：${remoteBackupPullResult.backup.device_id}`}</p>
        <p>{`会话数：${remoteBackupPullResult.backup.conversation_count}`}</p>
        <p>{`来源版本：${remoteBackupPullResult.backup.app_version}`}</p>
        {remoteBackupPulledPreviewPresentation ? (
          <>
            <p>{remoteBackupPulledPreviewPresentation.sourceLabel}</p>
            <p>{remoteBackupPulledPreviewPresentation.relationLabel}</p>
            <p className="settings-hint">
              {remoteBackupPulledPreviewPresentation.recommendation}
            </p>
          </>
        ) : null}
        {remoteBackupPulledPreviewGuardPresentation ? (
          <>
            <p>{remoteBackupPulledPreviewGuardPresentation.targetLabel}</p>
            {remoteBackupPulledPreviewGuardPresentation.warning ? (
              <p className="settings-warning-text">
                {remoteBackupPulledPreviewGuardPresentation.warning}
              </p>
            ) : null}
          </>
        ) : null}
        {remoteBackupPulledConversationImpactPresentation ? (
          <>
            <p>{remoteBackupPulledConversationImpactPresentation.title}</p>
            <p className="settings-hint">
              {remoteBackupPulledConversationImpactPresentation.mergeSummary}
            </p>
            <p className="settings-hint">
              {remoteBackupPulledConversationImpactPresentation.replaceSummary}
            </p>
          </>
        ) : null}
        <p className="settings-warning-text">
          {formatRemoteBackupRestoreWarning(remoteBackupPullResult.backup)}
        </p>
        {remoteImportGuardWarning ? (
          <p className="settings-warning-text">{remoteImportGuardWarning}</p>
        ) : null}
        <div className="settings-inline-actions">
          <button
            type="button"
            disabled={
              Boolean(remoteBackupBusyAction) ||
              !remoteBackupActions.restore.enabled ||
              !remoteBackupPulledPreviewGuardPresentation?.importEnabled
            }
            onClick={onRemoteMergeImport}
          >
            {remoteMergeImportGuardPresentation.buttonLabel}
          </button>
          <button
            type="button"
            className={
              remoteReplaceImportGuardPresentation.danger &&
              remoteReplaceImportArmed
                ? "top-bar-button-danger"
                : undefined
            }
            disabled={
              Boolean(remoteBackupBusyAction) ||
              !remoteBackupActions.restore.enabled ||
              !remoteBackupPulledPreviewGuardPresentation?.importEnabled
            }
            onClick={onRemoteReplaceImport}
          >
            {remoteReplaceImportGuardPresentation.buttonLabel}
          </button>
          <button
            type="button"
            disabled={Boolean(remoteBackupBusyAction)}
            onClick={onClearRemotePullResult}
          >
            清除本次拉取
          </button>
        </div>
      </article>
    ) : null}
  </section>
);
