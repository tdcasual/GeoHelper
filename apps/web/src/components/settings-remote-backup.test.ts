import { describe, expect, it } from "vitest";

import {
  formatRemoteBackupActionMessage,
  formatRemoteBackupRestoreWarning,
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
});
