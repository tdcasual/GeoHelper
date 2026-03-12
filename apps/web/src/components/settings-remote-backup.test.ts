import { describe, expect, it } from "vitest";

import {
  formatRemoteBackupActionMessage,
  formatRemoteBackupSelectedPullMessage,
  formatRemoteBackupRestoreWarning,
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

const metadata = {
  stored_at: "2026-03-12T10:00:00.000Z",
  schema_version: 2,
  created_at: "2026-03-12T09:58:00.000Z",
  updated_at: "2026-03-12T09:59:00.000Z",
  app_version: "0.0.1",
  checksum: "checksum-remote",
  conversation_count: 2,
  snapshot_id: "snap-remote",
  device_id: "device-remote"
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
      conversationCountLabel: "会话数：2"
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

    const blockedDiverged = resolveRemoteBackupSyncPresentation({
      status: "upload_blocked_diverged",
      lastError: null,
      latestRemoteBackup: metadata,
      lastCheckedAt: "2026-03-12T10:02:00.000Z"
    });
    expect(blockedDiverged.statusLabel).toBe("上传已阻止");
    expect(blockedDiverged.description).toContain("存在分叉");
    expect(blockedDiverged.description).toContain("保留历史");

    const uploadConflict = resolveRemoteBackupSyncPresentation({
      status: "upload_conflict",
      lastError: null,
      latestRemoteBackup: metadata,
      lastCheckedAt: "2026-03-12T10:02:00.000Z"
    });
    expect(uploadConflict.statusLabel).toBe("上传冲突");
    expect(uploadConflict.description).toContain("云端快照发生变化");
    expect(uploadConflict.description).toContain("保留历史");

    const forceRequired = resolveRemoteBackupSyncPresentation({
      status: "force_upload_required",
      lastError: null,
      latestRemoteBackup: metadata,
      lastCheckedAt: "2026-03-12T10:02:00.000Z"
    });
    expect(forceRequired.statusLabel).toBe("需要显式覆盖");
    expect(forceRequired.description).toContain("仍然覆盖云端快照");
    expect(forceRequired.description).toContain("保留历史");

    expect(shouldShowRemoteBackupForceUpload("remote_newer")).toBe(false);
    expect(shouldShowRemoteBackupForceUpload("upload_conflict")).toBe(true);
    expect(shouldShowRemoteBackupForceUpload("force_upload_required")).toBe(true);
    expect(shouldRecommendRemoteHistoryResolution("remote_newer")).toBe(true);
    expect(shouldRecommendRemoteHistoryResolution("upload_blocked_diverged")).toBe(true);
    expect(shouldRecommendRemoteHistoryResolution("up_to_date")).toBe(false);
  });
});
