import { describe, expect, it } from "vitest";
import * as remoteBackupHelpers from "./settings-remote-backup";
import type {
  RuntimeBackupComparableSummary,
  RuntimeBackupMetadata
} from "../runtime/types";

import {
  formatRemoteBackupActionMessage,
  formatRemoteBackupHistorySummary,
  formatRemoteBackupProtectionActionMessage,
  formatRemoteBackupProtectionLimitMessage,
  resolveRemoteBackupPulledConversationImpactPresentation,
  resolveRemoteBackupPulledPreviewGuardPresentation,
  resolveRemoteBackupPulledPreviewPresentation,
  formatRemoteBackupSelectedPullMessage,
  formatRemoteBackupRestoreWarning,
  resolveRemoteBackupHistoryComparisonPresentation,
  shouldRecommendRemoteHistoryResolution,
  shouldShowRemoteBackupForceUpload,
  resolveRemoteBackupHistorySelectionPresentation,
  resolveRemoteBackupSyncPresentation,
  resolveRemoteBackupActions
} from "./settings-remote-backup";

const directProfile = {
  id: "runtime_direct",
  name: "Direct BYOK",
  target: "direct" as const,
  baseUrl: "",
  updatedAt: 1
};

const gatewayProfile = {
  id: "runtime_gateway",
  name: "Gateway",
  target: "gateway" as const,
  baseUrl: "https://gateway.example.com",
  updatedAt: 2
};

const metadata: RuntimeBackupMetadata = {
  stored_at: "2026-03-12T10:00:00.000Z",
  schema_version: 2,
  created_at: "2026-03-12T09:58:00.000Z",
  updated_at: "2026-03-12T09:59:00.000Z",
  app_version: "0.0.1",
  checksum: "checksum-remote",
  conversation_count: 2,
  snapshot_id: "snap-remote",
  device_id: "device-remote",
  is_protected: false
};

const localSummary: RuntimeBackupComparableSummary = {
  schema_version: 2,
  created_at: "2026-03-12T09:58:00.000Z",
  updated_at: "2026-03-12T10:05:00.000Z",
  app_version: "0.0.1",
  checksum: "checksum-local",
  conversation_count: 3,
  snapshot_id: "snap-local",
  device_id: "device-local"
};

const localEnvelope = {
  schema_version: 2,
  created_at: "2026-03-12T09:58:00.000Z",
  updated_at: "2026-03-12T10:05:00.000Z",
  app_version: "0.0.1",
  checksum: "checksum-local-envelope",
  snapshot_id: "snap-local",
  device_id: "device-local",
  conversations: [
    {
      id: "conv-local-only",
      title: "local only",
      createdAt: 1,
      updatedAt: 10,
      messages: []
    },
    {
      id: "conv-shared-local",
      title: "shared local",
      createdAt: 2,
      updatedAt: 20,
      messages: []
    }
  ],
  settings: {}
};

describe("settings remote backup helpers", () => {
  it("disables remote backup actions when no gateway runtime is configured", () => {
    const state = resolveRemoteBackupActions({
      runtimeProfiles: [directProfile],
      defaultRuntimeProfileId: directProfile.id,
      hasAdminToken: true,
      hasPulledBackup: false
    });

    expect(state.gatewayProfile).toBeNull();
    expect(state.check).toEqual({
      enabled: false,
      reason: "请先配置可用的 Gateway 运行时地址"
    });
    expect(state.upload).toEqual({
      enabled: false,
      reason: "请先配置可用的 Gateway 运行时地址"
    });
    expect(state.pull).toEqual({
      enabled: false,
      reason: "请先配置可用的 Gateway 运行时地址"
    });
  });

  it("disables remote backup actions when admin token is missing", () => {
    const state = resolveRemoteBackupActions({
      runtimeProfiles: [gatewayProfile, directProfile],
      defaultRuntimeProfileId: gatewayProfile.id,
      hasAdminToken: false,
      hasPulledBackup: false
    });

    expect(state.gatewayProfile?.id).toBe(gatewayProfile.id);
    expect(state.check).toEqual({
      enabled: false,
      reason: "请先保存网关管理员令牌"
    });
    expect(state.upload).toEqual({
      enabled: false,
      reason: "请先保存网关管理员令牌"
    });
    expect(state.pull).toEqual({
      enabled: false,
      reason: "请先保存网关管理员令牌"
    });
    expect(state.restore).toEqual({
      enabled: false,
      reason: "请先从网关拉取最新备份"
    });
  });

  it("formats push success, pull success, and restore warning messages", () => {
    expect(formatRemoteBackupActionMessage("push", metadata)).toBe(
      "已上传到网关最新备份（2 个会话）"
    );
    expect(formatRemoteBackupActionMessage("pull", metadata)).toBe(
      "已从网关拉取最新备份（2 个会话）"
    );
    expect(formatRemoteBackupRestoreWarning(metadata)).toBe(
      "导入前请确认恢复策略：合并会保留较新的同 id 本地记录，覆盖会直接替换本地数据。"
    );
  });

  it("formats selected history snapshot details and selected pull success", () => {
    expect(formatRemoteBackupSelectedPullMessage(metadata)).toBe(
      "已从网关拉取所选快照（2 个会话）"
    );

    expect(
      resolveRemoteBackupHistorySelectionPresentation(metadata, metadata.snapshot_id)
    ).toMatchObject({
      statusLabel: "当前选择：云端最新快照",
      snapshotIdLabel: "快照 ID：snap-remote",
      deviceIdLabel: "设备 ID：device-remote",
      conversationCountLabel: "会话数：2",
      protectionLabel: "保护状态：未保护"
    });

    expect(
      resolveRemoteBackupHistorySelectionPresentation(metadata, "snap-other")
    ).toMatchObject({
      statusLabel: "当前选择：历史快照"
    });
  });

  it("formats compare-driven cloud sync labels and latest snapshot summary", () => {
    expect(
      resolveRemoteBackupSyncPresentation({
        status: "up_to_date",
        lastError: null,
        latestRemoteBackup: metadata,
        lastCheckedAt: "2026-03-12T10:02:00.000Z"
      })
    ).toMatchObject({
      statusLabel: "已同步"
    });

    expect(
      resolveRemoteBackupSyncPresentation({
        status: "local_newer",
        lastError: null,
        latestRemoteBackup: metadata,
        lastCheckedAt: "2026-03-12T10:02:00.000Z"
      })
    ).toMatchObject({
      statusLabel: "本地较新"
    });

    const remoteNewer = resolveRemoteBackupSyncPresentation({
      status: "remote_newer",
      lastError: null,
      latestRemoteBackup: metadata,
      lastCheckedAt: "2026-03-12T10:02:00.000Z"
    });
    expect(remoteNewer).toMatchObject({
      statusLabel: "云端较新"
    });
    expect(remoteNewer.latestSummary).toContain("2 个会话");
    expect(remoteNewer.latestSummary).toContain("snap-remote");
    expect(remoteNewer.description).toContain("保留历史");
    expect(remoteNewer.description).toContain("所选快照");

    expect(
      resolveRemoteBackupSyncPresentation({
        status: "diverged",
        lastError: null,
        latestRemoteBackup: metadata,
        lastCheckedAt: "2026-03-12T10:02:00.000Z"
      })
    ).toMatchObject({
      statusLabel: "存在分叉"
    });
  });

  it("keeps gateway-unavailable sync failures explicit", () => {
    expect(
      resolveRemoteBackupSyncPresentation({
        status: "idle",
        lastError: "Gateway unavailable",
        latestRemoteBackup: null,
        lastCheckedAt: "2026-03-12T10:02:00.000Z"
      })
    ).toMatchObject({
      statusLabel: "检查失败",
      description: "Gateway unavailable"
    });
  });

  it("formats blocked sync states with explicit conflict guidance", () => {
    const blockedRemoteNewer = resolveRemoteBackupSyncPresentation({
      status: "upload_blocked_remote_newer",
      lastError: null,
      latestRemoteBackup: metadata,
      lastCheckedAt: "2026-03-12T10:02:00.000Z"
    });
    expect(blockedRemoteNewer.statusLabel).toBe("上传已阻止");
    expect(blockedRemoteNewer.description).toContain("云端较新");
    expect(blockedRemoteNewer.description).toContain("不会自动覆盖");
    expect(blockedRemoteNewer.description).toContain("保留历史");
    expect(blockedRemoteNewer.description).toContain("保护当前选中的快照");

    const blockedDiverged = resolveRemoteBackupSyncPresentation({
      status: "upload_blocked_diverged",
      lastError: null,
      latestRemoteBackup: metadata,
      lastCheckedAt: "2026-03-12T10:02:00.000Z"
    });
    expect(blockedDiverged.statusLabel).toBe("上传已阻止");
    expect(blockedDiverged.description).toContain("存在分叉");
    expect(blockedDiverged.description).toContain("保留历史");
    expect(blockedDiverged.description).toContain("保护当前选中的快照");

    const uploadConflict = resolveRemoteBackupSyncPresentation({
      status: "upload_conflict",
      lastError: null,
      latestRemoteBackup: metadata,
      lastCheckedAt: "2026-03-12T10:02:00.000Z"
    });
    expect(uploadConflict.statusLabel).toBe("上传冲突");
    expect(uploadConflict.description).toContain("云端快照发生变化");
    expect(uploadConflict.description).toContain("保留历史");
    expect(uploadConflict.description).toContain("保护当前选中的快照");

    const forceRequired = resolveRemoteBackupSyncPresentation({
      status: "force_upload_required",
      lastError: null,
      latestRemoteBackup: metadata,
      lastCheckedAt: "2026-03-12T10:02:00.000Z"
    });
    expect(forceRequired.statusLabel).toBe("需要显式覆盖");
    expect(forceRequired.description).toContain("仍然覆盖云端快照");
    expect(forceRequired.description).toContain("保留历史");
    expect(forceRequired.description).toContain("保护当前选中的快照");

    expect(shouldShowRemoteBackupForceUpload("remote_newer")).toBe(false);
    expect(shouldShowRemoteBackupForceUpload("upload_conflict")).toBe(true);
    expect(shouldShowRemoteBackupForceUpload("force_upload_required")).toBe(true);
    expect(shouldRecommendRemoteHistoryResolution("remote_newer")).toBe(true);
    expect(shouldRecommendRemoteHistoryResolution("upload_blocked_diverged")).toBe(true);
    expect(shouldRecommendRemoteHistoryResolution("up_to_date")).toBe(false);
  });

  it("formats protected snapshot history summary and protection action messages", () => {
    const protectedMetadata = {
      ...metadata,
      snapshot_id: "snap-protected",
      is_protected: true,
      protected_at: "2026-03-12T10:06:00.000Z"
    };

    expect(
      formatRemoteBackupHistorySummary([protectedMetadata, metadata])
    ).toBe("云端保留历史：2 条（已保护 1 条）");

    expect(
      resolveRemoteBackupHistorySelectionPresentation(
        protectedMetadata,
        protectedMetadata.snapshot_id
      )
    ).toMatchObject({
      protectionLabel: "保护状态：已保护",
      protectedAtLabel: expect.stringContaining("保护时间：")
    });

    expect(
      formatRemoteBackupProtectionActionMessage("protect", protectedMetadata)
    ).toBe("已保护所选快照（snap-protected）");
    expect(
      formatRemoteBackupProtectionActionMessage("unprotect", protectedMetadata)
    ).toBe("已取消保护所选快照（snap-protected）");
    expect(
      formatRemoteBackupProtectionLimitMessage({
        protected_count: 1,
        max_protected: 1
      })
    ).toBe("受保护快照已达上限（1/1），请先取消保护旧快照。");
  });

  it("formats selected history preflight comparison against the current local snapshot", () => {
    expect(
      resolveRemoteBackupHistoryComparisonPresentation(
        localSummary,
        {
          ...metadata,
          checksum: "checksum-local",
          snapshot_id: "snap-remote-same"
        }
      )
    ).toEqual({
      relationLabel: "与本地关系：内容一致",
      recommendation: "当前所选快照与本地当前快照内容一致，如只做校验可不必重复拉取。"
    });

    expect(
      resolveRemoteBackupHistoryComparisonPresentation(localSummary, {
        ...metadata,
        checksum: "checksum-remote-newer",
        snapshot_id: "snap-remote-newer",
        updated_at: "2026-03-12T10:06:00.000Z",
        base_snapshot_id: "snap-local"
      })
    ).toEqual({
      relationLabel: "与本地关系：所选云端快照较新",
      recommendation: "当前所选云端快照比本地更新，建议先拉取该快照预览，再决定合并或覆盖。"
    });

    expect(
      resolveRemoteBackupHistoryComparisonPresentation(localSummary, {
        ...metadata,
        checksum: "checksum-remote-older",
        snapshot_id: "snap-remote-older",
        updated_at: "2026-03-12T10:01:00.000Z"
      })
    ).toEqual({
      relationLabel: "与本地关系：本地当前快照较新",
      recommendation: "本地当前快照比所选云端快照更新；如果要回退到这个历史点，建议先拉取预览，再决定合并或覆盖。"
    });

    expect(
      resolveRemoteBackupHistoryComparisonPresentation(localSummary, {
        ...metadata,
        checksum: "checksum-remote-diverged",
        snapshot_id: "snap-remote-diverged",
        updated_at: "2026-03-12T10:05:00.000Z"
      })
    ).toEqual({
      relationLabel: "与本地关系：存在分叉",
      recommendation: "当前所选云端快照与本地存在分叉，建议先拉取该快照预览，再决定合并或覆盖。"
    });
  });

  it("formats pulled preview guidance for latest and historical snapshot imports", () => {
    expect(
      resolveRemoteBackupPulledPreviewPresentation({
        source: "latest",
        localSummary,
        pulledBackup: {
          ...metadata,
          checksum: "checksum-remote-newer",
          snapshot_id: "snap-remote-newer",
          updated_at: "2026-03-12T10:06:00.000Z",
          base_snapshot_id: "snap-local"
        }
      })
    ).toEqual({
      sourceLabel: "拉取来源：云端最新快照",
      relationLabel: "与本地关系：拉取结果较新",
      recommendation:
        "导入建议：若想尽量保留本地新增内容，先使用合并导入；若确认完全以该快照为准，再使用覆盖导入。"
    });

    expect(
      resolveRemoteBackupPulledPreviewPresentation({
        source: "selected_history",
        localSummary,
        pulledBackup: {
          ...metadata,
          checksum: "checksum-remote-older",
          snapshot_id: "snap-remote-older",
          updated_at: "2026-03-12T10:01:00.000Z"
        }
      })
    ).toEqual({
      sourceLabel: "拉取来源：所选历史快照",
      relationLabel: "与本地关系：本地当前快照较新",
      recommendation:
        "导入建议：优先使用合并导入保留较新的本地记录；只有确认要回退到该快照时，再使用覆盖导入。"
    });

    expect(
      resolveRemoteBackupPulledPreviewPresentation({
        source: "latest",
        localSummary,
        pulledBackup: {
          ...metadata,
          checksum: "checksum-local",
          snapshot_id: "snap-remote-same"
        }
      })
    ).toEqual({
      sourceLabel: "拉取来源：云端最新快照",
      relationLabel: "与本地关系：内容一致",
      recommendation:
        "导入建议：当前拉取结果与本地内容一致，如只做校验可直接清除本次拉取，无需重复导入。"
    });
  });

  it("guards stale selected-history pull previews after the selection changes", () => {
    expect(
      resolveRemoteBackupPulledPreviewGuardPresentation({
        source: "latest",
        pulledSnapshotId: "snap-remote-latest",
        selectedSnapshotId: "snap-remote-older"
      })
    ).toEqual({
      targetLabel: "当前导入对象：云端最新快照（snap-remote-latest）",
      warning: null,
      importEnabled: true
    });

    expect(
      resolveRemoteBackupPulledPreviewGuardPresentation({
        source: "selected_history",
        pulledSnapshotId: "snap-remote-1",
        selectedSnapshotId: "snap-remote-1"
      })
    ).toEqual({
      targetLabel: "当前导入对象：已拉取历史快照（snap-remote-1）",
      warning: null,
      importEnabled: true
    });

    expect(
      resolveRemoteBackupPulledPreviewGuardPresentation({
        source: "selected_history",
        pulledSnapshotId: "snap-remote-1",
        selectedSnapshotId: "snap-remote-2"
      })
    ).toEqual({
      targetLabel: "当前导入对象：已拉取历史快照（snap-remote-1）",
      warning:
        "你当前选中的是 snap-remote-2；如要导入这个恢复点，请先重新拉取所选历史快照。",
      importEnabled: false
    });
  });

  it("formats pulled preview conversation impact counts for merge and replace", () => {
    expect(
      resolveRemoteBackupPulledConversationImpactPresentation({
        localEnvelopeAtPull: localEnvelope,
        pulledEnvelope: {
          ...localEnvelope,
          checksum: "checksum-remote-preview",
          snapshot_id: "snap-remote-preview",
          conversations: [
            {
              id: "conv-remote-new",
              title: "remote new",
              createdAt: 3,
              updatedAt: 30,
              messages: []
            },
            {
              id: "conv-shared-local",
              title: "shared remote newer",
              createdAt: 2,
              updatedAt: 25,
              messages: []
            }
          ]
        }
      })
    ).toEqual({
      title: "导入影响预估（按会话）",
      mergeSummary:
        "合并导入：预计新增 1 个会话、按远端更新 1 个同 id 会话、保留 1 个仅本地会话。",
      replaceSummary:
        "覆盖导入：预计用远端 2 个会话替换本地当前 2 个会话。"
    });

    expect(
      resolveRemoteBackupPulledConversationImpactPresentation({
        localEnvelopeAtPull: localEnvelope,
        pulledEnvelope: {
          ...localEnvelope,
          checksum: "checksum-remote-preview-older",
          snapshot_id: "snap-remote-preview-older",
          conversations: [
            {
              id: "conv-shared-local",
              title: "shared remote older",
              createdAt: 2,
              updatedAt: 15,
              messages: []
            }
          ]
        }
      })
    ).toEqual({
      title: "导入影响预估（按会话）",
      mergeSummary:
        "合并导入：预计新增 0 个会话、按远端更新 0 个同 id 会话、保留 1 个本地较新会话和 1 个仅本地会话。",
      replaceSummary:
        "覆盖导入：预计用远端 1 个会话替换本地当前 2 个会话。"
    });
  });

  it("formats compact relation badges for retained history list items", () => {
    const resolveRemoteBackupHistoryBadgePresentation = (
      remoteBackupHelpers as {
        resolveRemoteBackupHistoryBadgePresentation?: (
          local:
            | typeof localSummary
            | null
            | undefined,
          selected:
            | typeof metadata
            | null
            | undefined
        ) =>
          | {
              label: string;
              relation: string;
            }
          | null;
      }
    ).resolveRemoteBackupHistoryBadgePresentation;

    expect(resolveRemoteBackupHistoryBadgePresentation).toBeTypeOf("function");

    expect(
      resolveRemoteBackupHistoryBadgePresentation?.(localSummary, {
        ...metadata,
        checksum: "checksum-local",
        snapshot_id: "snap-same"
      })
    ).toEqual({
      label: "内容一致",
      relation: "identical"
    });

    expect(
      resolveRemoteBackupHistoryBadgePresentation?.(localSummary, {
        ...metadata,
        checksum: "checksum-remote-newer",
        snapshot_id: "snap-remote-newer",
        updated_at: "2026-03-12T10:06:00.000Z",
        base_snapshot_id: "snap-local"
      })
    ).toEqual({
      label: "云端较新",
      relation: "remote_newer"
    });

    expect(
      resolveRemoteBackupHistoryBadgePresentation?.(localSummary, {
        ...metadata,
        checksum: "checksum-remote-older",
        snapshot_id: "snap-remote-older",
        updated_at: "2026-03-12T10:01:00.000Z"
      })
    ).toEqual({
      label: "本地较新",
      relation: "local_newer"
    });

    expect(
      resolveRemoteBackupHistoryBadgePresentation?.(localSummary, {
        ...metadata,
        checksum: "checksum-remote-diverged",
        snapshot_id: "snap-remote-diverged",
        updated_at: "2026-03-12T10:05:00.000Z"
      })
    ).toEqual({
      label: "已分叉",
      relation: "diverged"
    });

    expect(
      resolveRemoteBackupHistoryBadgePresentation?.(null, metadata)
    ).toBeNull();
  });
});
