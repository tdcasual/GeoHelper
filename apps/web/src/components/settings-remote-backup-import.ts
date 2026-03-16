import { compareBackupComparableSummaries } from "@geohelper/protocol";

import type { RuntimeBackupComparableSummary, RuntimeBackupMetadata } from "../runtime/types";
import type { BackupEnvelope, ImportRollbackAnchor } from "../storage/backup";

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

export interface RemoteBackupPulledConversationImpactPresentation {
  title: string;
  mergeSummary: string;
  replaceSummary: string;
}

export interface ReplaceImportConfirmationPresentation {
  buttonLabel: string;
  warning: string | null;
}

export interface ImportActionGuardPresentation {
  buttonLabel: string;
  warning: string | null;
  shouldArmFirst: boolean;
  danger: boolean;
}

export interface ImportRollbackAnchorPresentation {
  title: string;
  sourceLabel: string;
  importModeLabel: string;
  summary: string;
  resultSummary: string | null;
  outcomeSummary: string | null;
  currentStateSummary: string | null;
  hint: string;
}

export type ReplaceImportConfirmationScope = "local" | "remote_pulled";
export type ImportActionGuardMode = "merge" | "replace";

interface BackupConversationChangeStats {
  beforeCount: number;
  afterCount: number;
  addedCount: number;
  updatedCount: number;
  removedCount: number;
  localWinsCount: number;
  localOnlyCount: number;
}

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

const toBackupConversationList = (
  input:
    | BackupEnvelope
    | Pick<BackupEnvelope, "conversations">
    | null
    | undefined
): Array<{ id: string; updatedAt: number; raw: unknown }> => {
  if (!input || !Array.isArray(input.conversations)) {
    return [];
  }

  return input.conversations
    .map((item) => (item && typeof item === "object" ? item : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      id: String(item.id ?? ""),
      updatedAt:
        typeof item.updatedAt === "number"
          ? item.updatedAt
          : typeof item.createdAt === "number"
            ? item.createdAt
            : 0,
      raw: item
    }))
    .filter((item) => item.id.length > 0);
};

const calculateBackupConversationChangeStats = (params: {
  before:
    | BackupEnvelope
    | Pick<BackupEnvelope, "conversations">
    | null
    | undefined;
  after:
    | BackupEnvelope
    | Pick<BackupEnvelope, "conversations">
    | null
    | undefined;
}): BackupConversationChangeStats => {
  const beforeConversations = toBackupConversationList(params.before);
  const afterConversations = toBackupConversationList(params.after);
  const beforeById = new Map(beforeConversations.map((item) => [item.id, item]));
  const afterIds = new Set(afterConversations.map((item) => item.id));

  let addedCount = 0;
  let updatedCount = 0;
  let localWinsCount = 0;

  for (const after of afterConversations) {
    const before = beforeById.get(after.id);
    if (!before) {
      addedCount += 1;
      continue;
    }

    if (JSON.stringify(before.raw) === JSON.stringify(after.raw)) {
      continue;
    }

    if (after.updatedAt >= before.updatedAt) {
      updatedCount += 1;
    } else {
      localWinsCount += 1;
    }
  }

  const localOnlyCount = beforeConversations.filter(
    (item) => !afterIds.has(item.id)
  ).length;

  return {
    beforeCount: beforeConversations.length,
    afterCount: afterConversations.length,
    addedCount,
    updatedCount,
    removedCount: localOnlyCount,
    localWinsCount,
    localOnlyCount
  };
};

export const formatRemoteBackupRestoreWarning = (
  _backup: Pick<RuntimeBackupMetadata, "stored_at" | "conversation_count">
): string =>
  "导入前请确认恢复策略：合并会保留较新的同 id 本地记录，覆盖会直接替换本地数据。";

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

export const resolveRemoteBackupPulledConversationImpactPresentation = (params: {
  localEnvelopeAtPull:
    | BackupEnvelope
    | Pick<BackupEnvelope, "conversations">
    | null
    | undefined;
  pulledEnvelope:
    | BackupEnvelope
    | Pick<BackupEnvelope, "conversations">
    | null
    | undefined;
}): RemoteBackupPulledConversationImpactPresentation | null => {
  if (!params.localEnvelopeAtPull || !params.pulledEnvelope) {
    return null;
  }

  const stats = calculateBackupConversationChangeStats({
    before: params.localEnvelopeAtPull,
    after: params.pulledEnvelope
  });

  const keptLocalSummary =
    stats.localWinsCount > 0
      ? `保留 ${stats.localWinsCount} 个本地较新会话和 ${stats.localOnlyCount} 个仅本地会话`
      : `保留 ${stats.localOnlyCount} 个仅本地会话`;

  return {
    title: "导入影响预估（按会话）",
    mergeSummary: `合并导入：预计新增 ${stats.addedCount} 个会话、按远端更新 ${stats.updatedCount} 个同 id 会话、${keptLocalSummary}。`,
    replaceSummary: `覆盖导入：预计用远端 ${stats.afterCount} 个会话替换本地当前 ${stats.beforeCount} 个会话。`
  };
};

export const resolveReplaceImportConfirmationPresentation = (
  scope: ReplaceImportConfirmationScope,
  armed: boolean
): ReplaceImportConfirmationPresentation => {
  const presentation = resolveImportActionGuardPresentation({
    scope,
    mode: "replace",
    armed,
    hasRollbackAnchor: false,
    anchorSourceLabel: null
  });

  return {
    buttonLabel: presentation.buttonLabel,
    warning: presentation.warning
  };
};

export const resolveImportActionGuardPresentation = (params: {
  scope: ReplaceImportConfirmationScope;
  mode: ImportActionGuardMode;
  armed: boolean;
  hasRollbackAnchor: boolean;
  anchorSourceLabel: string | null;
}): ImportActionGuardPresentation => {
  const isReplace = params.mode === "replace";
  const isRemote = params.scope === "remote_pulled";
  const anchorLabel = params.anchorSourceLabel
    ? `当前恢复锚点（${params.anchorSourceLabel}）`
    : "当前恢复锚点";

  const buttonLabel = isReplace
    ? isRemote
      ? params.armed
        ? "确认拉取后覆盖导入"
        : "拉取后覆盖导入"
      : params.armed
        ? "确认覆盖本地数据"
        : "覆盖导入"
    : isRemote
      ? params.armed
        ? "确认拉取后导入（合并）"
        : "拉取后导入（合并）"
      : params.armed
        ? "确认合并导入"
        : "合并导入（推荐）";

  if (!isReplace) {
    if (!params.hasRollbackAnchor) {
      return {
        buttonLabel,
        warning: null,
        shouldArmFirst: false,
        danger: false
      };
    }

    return params.armed
      ? {
          buttonLabel,
          warning: `${anchorLabel}将在继续导入后被替换。请再次点击“${buttonLabel}”继续。`,
          shouldArmFirst: false,
          danger: false
        }
      : {
          buttonLabel,
          warning: `${anchorLabel}将在继续导入后被替换。请先再次确认再继续导入。`,
          shouldArmFirst: true,
          danger: false
        };
  }

  const replaceWarning = isRemote
    ? "高风险操作：拉取后覆盖导入会直接替换当前本地数据"
    : "高风险操作：覆盖导入会直接替换当前本地数据";

  const warning = params.armed
    ? params.hasRollbackAnchor
      ? `${replaceWarning}，并替换${anchorLabel}。请再次点击“${buttonLabel}”继续。`
      : `${replaceWarning}，请再次点击“${buttonLabel}”继续。`
    : null;

  return {
    buttonLabel,
    warning,
    shouldArmFirst: !params.armed,
    danger: true
  };
};

export const resolveImportRollbackAnchorPresentation = (
  anchor: Pick<
    ImportRollbackAnchor,
    | "capturedAt"
    | "source"
    | "importMode"
    | "sourceDetail"
    | "envelope"
    | "importedAt"
    | "resultEnvelope"
  >,
  currentLocalEnvelope?: Pick<BackupEnvelope, "conversations" | "settings"> | null
): ImportRollbackAnchorPresentation => {
  const sourceLabel =
    anchor.source === "local_file"
      ? `来源：本地备份文件（${anchor.sourceDetail ?? "未命名文件"}）`
      : anchor.source === "remote_latest"
        ? `来源：云端最新快照（${anchor.sourceDetail ?? "未命名快照"}）`
        : `来源：所选历史快照（${anchor.sourceDetail ?? "未命名快照"}）`;

  const resultSummary = anchor.resultEnvelope
    ? `导入后本地快照：${anchor.resultEnvelope.snapshot_id} · ${anchor.resultEnvelope.conversations.length} 个会话`
    : null;
  const outcomeStats = anchor.resultEnvelope
    ? calculateBackupConversationChangeStats({
        before: anchor.envelope,
        after: anchor.resultEnvelope
      })
    : null;
  const outcomeSummary = outcomeStats
    ? anchor.importMode === "replace"
      ? `本次导入结果：覆盖后从 ${outcomeStats.beforeCount} 个会话变为 ${outcomeStats.afterCount} 个会话，移除了 ${outcomeStats.removedCount} 个原会话并引入 ${outcomeStats.addedCount} 个导入会话。`
      : `本次导入结果：新增 ${outcomeStats.addedCount} 个会话、更新 ${outcomeStats.updatedCount} 个同 id 会话；导入后当前共 ${outcomeStats.afterCount} 个会话。`
    : null;

  let currentStateSummary: string | null = null;
  let hint = "如本次导入结果不符合预期，可恢复到这次导入前的本地状态。";

  if (anchor.resultEnvelope && currentLocalEnvelope) {
    const currentMatchesImportedResult =
      JSON.stringify(currentLocalEnvelope.conversations ?? []) ===
      JSON.stringify(anchor.resultEnvelope.conversations ?? []);

    if (currentMatchesImportedResult) {
      currentStateSummary = "当前状态：仍与最近一次导入结果一致。";
    } else {
      currentStateSummary = "当前状态：本地已在这次导入后继续变化。";
      hint =
        "当前本地状态已经偏离最近一次导入结果；如果现在恢复，会同时丢弃导入后新增或修改的内容。";
    }
  }

  return {
    title: "导入前恢复锚点",
    sourceLabel,
    importModeLabel:
      anchor.importMode === "replace" ? "导入方式：覆盖导入" : "导入方式：合并导入",
    summary: `导入前本地快照：${anchor.envelope.snapshot_id} · ${anchor.envelope.conversations.length} 个会话`,
    resultSummary,
    outcomeSummary,
    currentStateSummary,
    hint
  };
};
