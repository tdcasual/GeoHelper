import type {
  RemoteBackupSyncStatus,
  RuntimeBackupComparableSummary,
  RuntimeBackupMetadata
} from "../runtime/types";
import type { BackupEnvelope } from "../storage/backup";

export interface RemoteBackupSyncPresentation {
  statusLabel: string;
  description: string;
  latestSummary: string | null;
  checkedAtLabel: string | null;
}

export interface ResolveRemoteBackupSyncPresentationParams {
  status: RemoteBackupSyncStatus;
  lastError: string | null;
  latestRemoteBackup: RuntimeBackupMetadata | null;
  lastCheckedAt: string | null;
}

export const shouldRecommendRemoteHistoryResolution = (
  status: RemoteBackupSyncStatus
): boolean =>
  status === "remote_newer" ||
  status === "diverged" ||
  status === "upload_blocked_remote_newer" ||
  status === "upload_blocked_diverged" ||
  status === "upload_conflict" ||
  status === "force_upload_required";

export const shouldShowRemoteBackupForceUpload = (
  status: RemoteBackupSyncStatus
): boolean => status === "upload_conflict" || status === "force_upload_required";

const formatRemoteBackupStatusLabel = (
  status: RemoteBackupSyncStatus
): string => {
  switch (status) {
    case "checking":
      return "检查中";
    case "uploading":
      return "上传中";
    case "up_to_date":
      return "已同步";
    case "local_newer":
      return "本地较新";
    case "remote_newer":
      return "云端较新";
    case "diverged":
      return "存在分叉";
    case "upload_blocked_remote_newer":
    case "upload_blocked_diverged":
      return "上传已阻止";
    case "upload_conflict":
      return "上传冲突";
    case "force_upload_required":
      return "需要显式覆盖";
    case "idle":
    default:
      return "未检查";
  }
};

const formatRemoteBackupStatusDescription = (
  status: RemoteBackupSyncStatus
): string => {
  switch (status) {
    case "checking":
      return "正在比对本地快照与云端最新快照。";
    case "uploading":
      return "正在校验云端前提并上传本地最新快照。";
    case "up_to_date":
      return "本地快照与云端最新快照一致。";
    case "local_newer":
      return "本地快照较新，可按需上传最新快照到云端。";
    case "remote_newer":
      return "云端快照较新，建议先检查云端保留历史并按需拉取所选快照；如这是关键恢复点，可先保护当前选中的快照，再决定导入策略。";
    case "diverged":
      return "本地与云端快照存在分叉，建议先检查云端保留历史并拉取要恢复的快照；如这是关键恢复点，可先保护当前选中的快照，再确认导入策略。";
    case "upload_blocked_remote_newer":
      return "检测到云端较新，默认上传不会自动覆盖；建议先检查云端保留历史并拉取要恢复的快照，先保护当前选中的快照，或显式确认覆盖。";
    case "upload_blocked_diverged":
      return "检测到本地与云端存在分叉，默认上传不会自动覆盖；建议先检查云端保留历史并拉取要恢复的快照，先保护当前选中的快照，再确认导入策略。";
    case "upload_conflict":
      return "上传期间云端快照发生变化，默认上传未覆盖云端；建议先检查云端保留历史并拉取要恢复的快照，先保护当前选中的快照，如确认本地为准再点击“仍然覆盖云端快照”。";
    case "force_upload_required":
      return "默认上传不会自动覆盖当前云端快照；建议先检查云端保留历史并拉取要恢复的快照，先保护当前选中的快照，如确认本地为准再点击“仍然覆盖云端快照”。";
    case "idle":
    default:
      return "尚未检查云端快照状态。";
  }
};

const formatLatestRemoteBackupSummary = (
  backup: RuntimeBackupMetadata | null
): string | null => {
  if (!backup) {
    return null;
  }

  return `云端最新快照：${new Date(backup.stored_at).toLocaleString(
    "zh-CN"
  )} · ${backup.conversation_count} 个会话 · ${backup.snapshot_id}`;
};

export const resolveRemoteBackupSyncPresentation = (
  params: ResolveRemoteBackupSyncPresentationParams
): RemoteBackupSyncPresentation => {
  if (params.lastError) {
    return {
      statusLabel: "检查失败",
      description: params.lastError,
      latestSummary: formatLatestRemoteBackupSummary(params.latestRemoteBackup),
      checkedAtLabel: params.lastCheckedAt
        ? `最近检查：${new Date(params.lastCheckedAt).toLocaleString("zh-CN")}`
        : null
    };
  }

  return {
    statusLabel: formatRemoteBackupStatusLabel(params.status),
    description: formatRemoteBackupStatusDescription(params.status),
    latestSummary: formatLatestRemoteBackupSummary(params.latestRemoteBackup),
    checkedAtLabel: params.lastCheckedAt
      ? `最近检查：${new Date(params.lastCheckedAt).toLocaleString("zh-CN")}`
      : null
  };
};

export const createComparableSummaryFromBackupEnvelope = (
  envelope: BackupEnvelope
): RuntimeBackupComparableSummary => ({
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
