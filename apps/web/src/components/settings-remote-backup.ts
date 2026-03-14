import { compareBackupComparableSummaries } from "@geohelper/protocol";

import type {
  RemoteBackupSyncStatus,
  RuntimeBackupComparableSummary,
  RuntimeBackupMetadata
} from "../runtime/types";
import type { BackupEnvelope } from "../storage/backup";
import type { RuntimeProfile } from "../state/settings-store";

export interface RemoteBackupActionStatus {
  enabled: boolean;
  reason: string | null;
}

export interface RemoteBackupActionState {
  gatewayProfile: RuntimeProfile | null;
  check: RemoteBackupActionStatus;
  upload: RemoteBackupActionStatus;
  pull: RemoteBackupActionStatus;
  restore: RemoteBackupActionStatus;
}

export interface RemoteBackupSyncPresentation {
  statusLabel: string;
  description: string;
  latestSummary: string | null;
  checkedAtLabel: string | null;
}

export interface RemoteBackupHistorySelectionPresentation {
  statusLabel: string;
  snapshotIdLabel: string;
  deviceIdLabel: string;
  updatedAtLabel: string;
  conversationCountLabel: string;
  protectionLabel: string;
  protectedAtLabel: string | null;
}

export interface RemoteBackupHistoryComparisonPresentation {
  relationLabel: string;
  recommendation: string;
}

export interface RemoteBackupHistoryBadgePresentation {
  label: string;
  relation: "identical" | "local_newer" | "remote_newer" | "diverged";
}

export type RemoteBackupPullSource = "latest" | "selected_history";

export interface RemoteBackupPulledPreviewPresentation {
  sourceLabel: string;
  relationLabel: string;
  recommendation: string;
}

export interface RemoteBackupPulledPreviewGuardPresentation {
  targetLabel: string;
  warning: string | null;
  importEnabled: boolean;
}

interface ResolveRemoteBackupSyncPresentationParams {
  status: RemoteBackupSyncStatus;
  lastError: string | null;
  latestRemoteBackup: RuntimeBackupMetadata | null;
  lastCheckedAt: string | null;
}

interface ResolveRemoteBackupActionsParams {
  runtimeProfiles: RuntimeProfile[];
  defaultRuntimeProfileId: string;
  hasAdminToken: boolean;
  hasPulledBackup: boolean;
}

const GATEWAY_RUNTIME_REQUIRED = "请先配置可用的 Gateway 运行时地址";
const ADMIN_TOKEN_REQUIRED = "请先保存网关管理员令牌";
const PULL_BACKUP_REQUIRED = "请先从网关拉取最新备份";

const hasUsableGatewayBaseUrl = (profile: RuntimeProfile): boolean =>
  profile.target === "gateway" && profile.baseUrl.trim().length > 0;

const pickGatewayProfile = (
  runtimeProfiles: RuntimeProfile[],
  defaultRuntimeProfileId: string
): RuntimeProfile | null => {
  const preferred = runtimeProfiles.find(
    (profile) =>
      profile.id === defaultRuntimeProfileId && hasUsableGatewayBaseUrl(profile)
  );
  if (preferred) {
    return preferred;
  }

  return (
    runtimeProfiles.find((profile) => hasUsableGatewayBaseUrl(profile)) ?? null
  );
};

export const resolveRemoteBackupActions = (
  params: ResolveRemoteBackupActionsParams
): RemoteBackupActionState => {
  const gatewayProfile = pickGatewayProfile(
    params.runtimeProfiles,
    params.defaultRuntimeProfileId
  );

  if (!gatewayProfile) {
    return {
      gatewayProfile: null,
      check: {
        enabled: false,
        reason: GATEWAY_RUNTIME_REQUIRED
      },
      upload: {
        enabled: false,
        reason: GATEWAY_RUNTIME_REQUIRED
      },
      pull: {
        enabled: false,
        reason: GATEWAY_RUNTIME_REQUIRED
      },
      restore: {
        enabled: params.hasPulledBackup,
        reason: params.hasPulledBackup ? null : PULL_BACKUP_REQUIRED
      }
    };
  }

  const uploadAndPullState = params.hasAdminToken
    ? {
        enabled: true,
        reason: null
      }
    : {
        enabled: false,
        reason: ADMIN_TOKEN_REQUIRED
      };

  return {
    gatewayProfile,
    check: uploadAndPullState,
    upload: uploadAndPullState,
    pull: uploadAndPullState,
    restore: {
      enabled: params.hasPulledBackup,
      reason: params.hasPulledBackup ? null : PULL_BACKUP_REQUIRED
    }
  };
};

export const formatRemoteBackupActionMessage = (
  action: "push" | "pull",
  backup: Pick<RuntimeBackupMetadata, "conversation_count">
): string =>
  action === "push"
    ? `已上传到网关最新备份（${backup.conversation_count} 个会话）`
    : `已从网关拉取最新备份（${backup.conversation_count} 个会话）`;

export const formatRemoteBackupRestoreWarning = (
  _backup: Pick<RuntimeBackupMetadata, "stored_at" | "conversation_count">
): string =>
  "导入前请确认恢复策略：合并会保留较新的同 id 本地记录，覆盖会直接替换本地数据。";

export const formatRemoteBackupSelectedPullMessage = (
  backup: Pick<RuntimeBackupMetadata, "conversation_count">
): string => `已从网关拉取所选快照（${backup.conversation_count} 个会话）`;

export const formatRemoteBackupHistorySummary = (
  history: Array<Pick<RuntimeBackupMetadata, "is_protected">>
): string => {
  const protectedCount = history.filter((backup) => backup.is_protected).length;
  return protectedCount > 0
    ? `云端保留历史：${history.length} 条（已保护 ${protectedCount} 条）`
    : `云端保留历史：${history.length} 条`;
};

export const formatRemoteBackupProtectionActionMessage = (
  action: "protect" | "unprotect",
  backup: Pick<RuntimeBackupMetadata, "snapshot_id">
): string =>
  action === "protect"
    ? `已保护所选快照（${backup.snapshot_id}）`
    : `已取消保护所选快照（${backup.snapshot_id}）`;

export const formatRemoteBackupProtectionLimitMessage = (input: {
  protected_count: number;
  max_protected: number;
}): string =>
  `受保护快照已达上限（${input.protected_count}/${input.max_protected}），请先取消保护旧快照。`;

export const shouldRecommendRemoteHistoryResolution = (
  status: RemoteBackupSyncStatus
): boolean =>
  status === "remote_newer" ||
  status === "diverged" ||
  status === "upload_blocked_remote_newer" ||
  status === "upload_blocked_diverged" ||
  status === "upload_conflict" ||
  status === "force_upload_required";

export const resolveRemoteBackupHistorySelectionPresentation = (
  backup: Pick<
    RuntimeBackupMetadata,
    | "snapshot_id"
    | "device_id"
    | "updated_at"
    | "conversation_count"
    | "is_protected"
    | "protected_at"
  >,
  latestSnapshotId?: string | null
): RemoteBackupHistorySelectionPresentation => ({
  statusLabel:
    backup.snapshot_id === latestSnapshotId ? "当前选择：云端最新快照" : "当前选择：历史快照",
  snapshotIdLabel: `快照 ID：${backup.snapshot_id}`,
  deviceIdLabel: `设备 ID：${backup.device_id}`,
  updatedAtLabel: `更新时间：${new Date(backup.updated_at).toLocaleString("zh-CN")}`,
  conversationCountLabel: `会话数：${backup.conversation_count}`,
  protectionLabel: backup.is_protected ? "保护状态：已保护" : "保护状态：未保护",
  protectedAtLabel:
    backup.is_protected && backup.protected_at
      ? `保护时间：${new Date(backup.protected_at).toLocaleString("zh-CN")}`
      : null
});

const REMOTE_BACKUP_HISTORY_RELATION_COPY: Record<
  "identical" | "local_newer" | "remote_newer" | "diverged",
  {
    badgeLabel: string;
    relationLabel: string;
    recommendation: string;
  }
> = {
  identical: {
    badgeLabel: "内容一致",
    relationLabel: "与本地关系：内容一致",
    recommendation:
      "当前所选快照与本地当前快照内容一致，如只做校验可不必重复拉取。"
  },
  local_newer: {
    badgeLabel: "本地较新",
    relationLabel: "与本地关系：本地当前快照较新",
    recommendation:
      "本地当前快照比所选云端快照更新；如果要回退到这个历史点，建议先拉取预览，再决定合并或覆盖。"
  },
  remote_newer: {
    badgeLabel: "云端较新",
    relationLabel: "与本地关系：所选云端快照较新",
    recommendation:
      "当前所选云端快照比本地更新，建议先拉取该快照预览，再决定合并或覆盖。"
  },
  diverged: {
    badgeLabel: "已分叉",
    relationLabel: "与本地关系：存在分叉",
    recommendation:
      "当前所选云端快照与本地存在分叉，建议先拉取该快照预览，再决定合并或覆盖。"
  }
};

const REMOTE_BACKUP_PULL_SOURCE_LABELS: Record<RemoteBackupPullSource, string> = {
  latest: "拉取来源：云端最新快照",
  selected_history: "拉取来源：所选历史快照"
};

const REMOTE_BACKUP_PULLED_RELATION_COPY: Record<
  "identical" | "local_newer" | "remote_newer" | "diverged",
  {
    relationLabel: string;
    recommendation: string;
  }
> = {
  identical: {
    relationLabel: "与本地关系：内容一致",
    recommendation:
      "导入建议：当前拉取结果与本地内容一致，如只做校验可直接清除本次拉取，无需重复导入。"
  },
  local_newer: {
    relationLabel: "与本地关系：本地当前快照较新",
    recommendation:
      "导入建议：优先使用合并导入保留较新的本地记录；只有确认要回退到该快照时，再使用覆盖导入。"
  },
  remote_newer: {
    relationLabel: "与本地关系：拉取结果较新",
    recommendation:
      "导入建议：若想尽量保留本地新增内容，先使用合并导入；若确认完全以该快照为准，再使用覆盖导入。"
  },
  diverged: {
    relationLabel: "与本地关系：存在分叉",
    recommendation:
      "导入建议：当前拉取结果与本地存在分叉，建议先合并导入做保守恢复；仅在确认完整回退时使用覆盖导入。"
  }
};

export const resolveRemoteBackupHistoryBadgePresentation = (
  localSummary: RuntimeBackupComparableSummary | null | undefined,
  selectedBackup: RuntimeBackupComparableSummary | null | undefined
): RemoteBackupHistoryBadgePresentation | null => {
  if (!localSummary || !selectedBackup) {
    return null;
  }

  const comparison = compareBackupComparableSummaries(localSummary, selectedBackup);
  const copy = REMOTE_BACKUP_HISTORY_RELATION_COPY[comparison.relation];

  return {
    label: copy.badgeLabel,
    relation: comparison.relation
  };
};

export const resolveRemoteBackupPulledPreviewPresentation = (params: {
  source: RemoteBackupPullSource;
  localSummary: RuntimeBackupComparableSummary | null | undefined;
  pulledBackup: RuntimeBackupComparableSummary | null | undefined;
}): RemoteBackupPulledPreviewPresentation | null => {
  if (!params.localSummary || !params.pulledBackup) {
    return null;
  }

  const comparison = compareBackupComparableSummaries(
    params.localSummary,
    params.pulledBackup
  );
  const copy = REMOTE_BACKUP_PULLED_RELATION_COPY[comparison.relation];

  return {
    sourceLabel: REMOTE_BACKUP_PULL_SOURCE_LABELS[params.source],
    relationLabel: copy.relationLabel,
    recommendation: copy.recommendation
  };
};

export const resolveRemoteBackupPulledPreviewGuardPresentation = (params: {
  source: RemoteBackupPullSource;
  pulledSnapshotId: string;
  selectedSnapshotId: string | null | undefined;
}): RemoteBackupPulledPreviewGuardPresentation => {
  if (params.source === "latest") {
    return {
      targetLabel: `当前导入对象：云端最新快照（${params.pulledSnapshotId}）`,
      warning: null,
      importEnabled: true
    };
  }

  const isStale =
    Boolean(params.selectedSnapshotId) &&
    params.selectedSnapshotId !== params.pulledSnapshotId;

  return {
    targetLabel: `当前导入对象：已拉取历史快照（${params.pulledSnapshotId}）`,
    warning: isStale
      ? `你当前选中的是 ${params.selectedSnapshotId}；如要导入这个恢复点，请先重新拉取所选历史快照。`
      : null,
    importEnabled: !isStale
  };
};

export const resolveRemoteBackupHistoryComparisonPresentation = (
  localSummary: RuntimeBackupComparableSummary | null | undefined,
  selectedBackup: RuntimeBackupComparableSummary | null | undefined
): RemoteBackupHistoryComparisonPresentation | null => {
  if (!localSummary || !selectedBackup) {
    return null;
  }

  const comparison = compareBackupComparableSummaries(localSummary, selectedBackup);
  const copy = REMOTE_BACKUP_HISTORY_RELATION_COPY[comparison.relation];

  return {
    relationLabel: copy.relationLabel,
    recommendation: copy.recommendation
  };
};

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
