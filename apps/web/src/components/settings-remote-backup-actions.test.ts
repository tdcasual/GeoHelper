import { describe, expect, it } from "vitest";

import type { RuntimeBackupMetadata } from "../runtime/types";
import {
  formatRemoteBackupActionMessage,
  formatRemoteBackupProtectionActionMessage,
  formatRemoteBackupProtectionLimitMessage,
  resolveRemoteBackupActions
} from "./settings-remote-backup-actions";

const directProfile = {
  id: "runtime_direct",
  name: "Direct BYOK",
  target: "direct" as const,
  providerBaseUrl: "",
  updatedAt: 1
};

const gatewayProfile = {
  id: "runtime_gateway",
  name: "Gateway",
  target: "gateway" as const,
  gatewayBaseUrl: "https://gateway.example.com",
  controlPlaneBaseUrl: "https://control-plane.example.com",
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

describe("settings remote backup actions", () => {
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

  it("formats push success and protection action messages", () => {
    expect(formatRemoteBackupActionMessage("push", metadata)).toBe(
      "已上传到网关最新备份（2 个会话）"
    );
    expect(formatRemoteBackupActionMessage("pull", metadata)).toBe(
      "已从网关拉取最新备份（2 个会话）"
    );
    expect(formatRemoteBackupProtectionActionMessage("protect", metadata)).toBe(
      "已保护所选快照（snap-remote）"
    );
    expect(formatRemoteBackupProtectionActionMessage("unprotect", metadata)).toBe(
      "已取消保护所选快照（snap-remote）"
    );
    expect(
      formatRemoteBackupProtectionLimitMessage({
        protected_count: 1,
        max_protected: 1
      })
    ).toBe("受保护快照已达上限（1/1），请先取消保护旧快照。");
  });
});
