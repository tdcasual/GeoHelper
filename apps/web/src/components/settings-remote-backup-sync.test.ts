import { describe, expect, it } from "vitest";

import type { RuntimeBackupMetadata } from "../runtime/types";
import {
  createComparableSummaryFromBackupEnvelope,
  resolveRemoteBackupSyncPresentation,
  shouldRecommendRemoteHistoryResolution,
  shouldShowRemoteBackupForceUpload
} from "./settings-remote-backup-sync";

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

describe("settings remote backup sync", () => {
  it("formats compare-driven cloud sync labels and latest snapshot summary", () => {
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
    const forceRequired = resolveRemoteBackupSyncPresentation({
      status: "force_upload_required",
      lastError: null,
      latestRemoteBackup: metadata,
      lastCheckedAt: "2026-03-12T10:02:00.000Z"
    });

    expect(forceRequired.statusLabel).toBe("需要显式覆盖");
    expect(forceRequired.description).toContain("仍然覆盖云端快照");
    expect(shouldShowRemoteBackupForceUpload("upload_conflict")).toBe(true);
    expect(shouldShowRemoteBackupForceUpload("remote_newer")).toBe(false);
    expect(shouldRecommendRemoteHistoryResolution("upload_blocked_diverged")).toBe(
      true
    );
    expect(shouldRecommendRemoteHistoryResolution("up_to_date")).toBe(false);
  });

  it("creates comparable summaries from backup envelopes", () => {
    expect(
      createComparableSummaryFromBackupEnvelope({
        schema_version: 2,
        created_at: "2026-03-12T09:58:00.000Z",
        updated_at: "2026-03-12T10:05:00.000Z",
        app_version: "0.0.1",
        checksum: "checksum-local-envelope",
        snapshot_id: "snap-local",
        device_id: "device-local",
        conversations: [{ id: "conv-1" }, { id: "conv-2" }],
        settings: {}
      })
    ).toEqual({
      schema_version: 2,
      created_at: "2026-03-12T09:58:00.000Z",
      updated_at: "2026-03-12T10:05:00.000Z",
      app_version: "0.0.1",
      checksum: "checksum-local-envelope",
      snapshot_id: "snap-local",
      device_id: "device-local",
      conversation_count: 2
    });
  });
});
