import { compareBackupComparableSummaries } from "@geohelper/protocol";

import type {
  RuntimeBackupComparableSummary,
  RuntimeBackupMetadata
} from "../runtime/types";

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
