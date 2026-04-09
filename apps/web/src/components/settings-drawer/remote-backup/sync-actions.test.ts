import { describe, expect, it, vi } from "vitest";

import type {
  RuntimeBackupComparableSummary,
  RuntimeBackupCompareResponse,
  RuntimeBackupMetadata,
  RuntimeBuildIdentity
} from "../../../runtime/types";
import { createRemoteBackupSyncActions } from "./sync-actions";

const build: RuntimeBuildIdentity = {
  git_sha: "sha",
  build_time: "2026-03-16T00:00:00.000Z",
  node_env: "test",
  redis_enabled: false,
  attachments_enabled: true
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

const remoteBackup: RuntimeBackupMetadata = {
  ...localSummary,
  checksum: "checksum-remote",
  stored_at: "2026-03-12T10:06:00.000Z",
  is_protected: false
};

const comparison: RuntimeBackupCompareResponse = {
  local_status: "summary",
  remote_status: "available",
  comparison_result: "remote_newer",
  local_snapshot: {
    summary: localSummary
  },
  remote_snapshot: {
    summary: remoteBackup
  },
  build
};

describe("remote-backup sync actions", () => {
  it("requires force upload when remote status blocks manual overwrite", async () => {
    const setRemoteBackupSyncResult = vi.fn();
    const setBackupMessage = vi.fn();
    const actions = createRemoteBackupSyncActions({
      loadBackupModule: vi.fn(),
      remoteBackupActions: {
        gatewayProfile: {
          id: "gateway",
          name: "Gateway",
          target: "gateway",
          gatewayBaseUrl: "https://gateway.example.com",
          controlPlaneBaseUrl: "https://control-plane.example.com",
          updatedAt: 1
        },
        check: { enabled: true, reason: null },
        upload: { enabled: true, reason: null },
        pull: { enabled: true, reason: null },
        restore: { enabled: false, reason: null }
      },
      remoteBackupSync: {
        status: "remote_newer",
        latestRemoteBackup: remoteBackup,
        history: [remoteBackup],
        lastComparison: comparison,
        lastCheckedAt: null,
        lastError: null
      },
      selectedRemoteHistoryBackup: null,
      readRemoteBackupAdminToken: vi.fn(),
      beginRemoteBackupSyncCheck: vi.fn(),
      beginRemoteBackupSyncUpload: vi.fn(),
      setRemoteBackupSyncResult,
      setRemoteBackupSyncError: vi.fn(),
      applyRemoteBackupSnapshotUpdate: vi.fn(),
      setRemoteBackupBusyAction: vi.fn(),
      setBackupMessage,
      setRemoteBackupPullResult: vi.fn()
    });

    await actions.handleUploadRemoteBackup("guarded");

    expect(setRemoteBackupSyncResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: "force_upload_required" })
    );
    expect(setBackupMessage).toHaveBeenCalledWith(
      "默认上传不会自动覆盖当前云端快照；如确认本地为准，请点击“仍然覆盖云端快照”。"
    );
  });
});
