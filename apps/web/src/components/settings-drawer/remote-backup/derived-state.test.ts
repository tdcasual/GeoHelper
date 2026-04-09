import { describe, expect, it } from "vitest";

import { buildRemoteBackupDerivedState } from "./derived-state";
import type { RemoteBackupPulledResult } from "./sync-actions";

const history = [
  {
    stored_at: "2026-03-16T00:00:00.000Z",
    schema_version: 2,
    created_at: "2026-03-12T09:58:00.000Z",
    updated_at: "2026-03-12T10:06:00.000Z",
    app_version: "0.0.1",
    checksum: "checksum-remote-latest",
    conversation_count: 2,
    snapshot_id: "snap-latest",
    device_id: "device-remote",
    is_protected: false
  },
  {
    stored_at: "2026-03-15T00:00:00.000Z",
    schema_version: 2,
    created_at: "2026-03-12T09:58:00.000Z",
    updated_at: "2026-03-12T10:04:00.000Z",
    app_version: "0.0.1",
    checksum: "checksum-remote-old",
    conversation_count: 1,
    snapshot_id: "snap-older",
    device_id: "device-remote",
    is_protected: false
  }
];

const remoteBackupPullResult: RemoteBackupPulledResult = {
  build: {
    git_sha: "sha",
    build_time: "2026-03-16T00:00:00.000Z",
    node_env: "test",
    redis_enabled: false,
    attachments_enabled: true
  },
  backup: {
    ...history[1]!,
    envelope: {
      schema_version: 2,
      created_at: "2026-03-12T09:58:00.000Z",
      updated_at: "2026-03-12T10:04:00.000Z",
      app_version: "0.0.1",
      checksum: "checksum-remote-old",
      snapshot_id: "snap-older",
      device_id: "device-remote",
      conversations: [],
      settings: {}
    }
  },
  pullSource: "selected_history",
  localSummaryAtPull: {
    schema_version: 2,
    created_at: "2026-03-12T09:58:00.000Z",
    updated_at: "2026-03-12T10:05:00.000Z",
    app_version: "0.0.1",
    checksum: "checksum-local",
    conversation_count: 3,
    snapshot_id: "snap-local",
    device_id: "device-local"
  },
  localEnvelopeAtPull: {
    schema_version: 2,
    created_at: "2026-03-12T09:58:00.000Z",
    updated_at: "2026-03-12T10:05:00.000Z",
    app_version: "0.0.1",
    checksum: "checksum-local",
    snapshot_id: "snap-local",
    device_id: "device-local",
    conversations: [],
    settings: {}
  }
};

describe("remote-backup derived state", () => {
  it("falls back to the latest history snapshot and derives stale-preview warnings", () => {
    const derived = buildRemoteBackupDerivedState({
      runtimeProfiles: [
        {
          id: "gateway",
          name: "Gateway",
          target: "gateway",
          gatewayBaseUrl: "https://gateway.example.com",
          controlPlaneBaseUrl: "https://control-plane.example.com",
          updatedAt: 1
        }
      ],
      defaultRuntimeProfileId: "gateway",
      remoteBackupAdminTokenCipher: { iv: "iv", ciphertext: "cipher" },
      remoteBackupSync: {
        status: "remote_newer",
        latestRemoteBackup: history[0]!,
        history,
        lastComparison: {
          local_status: "summary",
          remote_status: "available",
          comparison_result: "remote_newer",
          local_snapshot: {
            summary: remoteBackupPullResult.localSummaryAtPull
          },
          remote_snapshot: {
            summary: history[0]!
          },
          build: remoteBackupPullResult.build
        },
        lastCheckedAt: null,
        lastError: null
      },
      remoteBackupPullResult,
      selectedRemoteHistorySnapshotId: "missing-id",
      importRollbackAnchor: {
        capturedAt: "2026-03-16T00:00:00.000Z",
        source: "local_file",
        importMode: "merge",
        sourceDetail: "lesson-a.json",
        envelope: remoteBackupPullResult.localEnvelopeAtPull
      },
      rollbackAnchorCurrentLocalEnvelope: remoteBackupPullResult.localEnvelopeAtPull,
      localMergeImportArmed: false,
      localReplaceImportArmed: true,
      remoteMergeImportArmed: false,
      remoteReplaceImportArmed: true
    });

    expect(derived.selectedRemoteHistoryBackup?.snapshot_id).toBe("snap-latest");
    expect(derived.selectedRemoteHistoryPresentation?.statusLabel).toBe(
      "当前选择：云端最新快照"
    );
    expect(derived.localImportGuardWarning).toContain("恢复锚点");
    expect(derived.remoteBackupPulledPreviewGuardPresentation?.warning).toContain(
      "请先重新拉取所选历史快照"
    );
  });
});
