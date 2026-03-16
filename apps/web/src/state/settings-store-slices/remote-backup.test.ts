import { describe, expect, it } from "vitest";

import type {
  RuntimeBackupComparableSummary,
  RuntimeBackupCompareResponse,
  RuntimeBackupMetadata,
  RuntimeBuildIdentity
} from "../../runtime/types";
import {
  applyRemoteBackupSnapshotToComparison,
  applyRemoteBackupSnapshotToHistory,
  createInitialRemoteBackupSyncState,
  mapComparisonResultToSyncStatus
} from "./remote-backup";

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
  conversation_count: 2,
  snapshot_id: "snap-local",
  device_id: "device-local"
};

const oldBackup: RuntimeBackupMetadata = {
  ...localSummary,
  checksum: "checksum-old",
  stored_at: "2026-03-16T00:00:00.000Z",
  is_protected: false
};

const updatedBackup: RuntimeBackupMetadata = {
  ...oldBackup,
  checksum: "checksum-new"
};

const comparison: RuntimeBackupCompareResponse = {
  local_status: "summary",
  remote_status: "available",
  comparison_result: "remote_newer",
  local_snapshot: {
    summary: localSummary
  },
  remote_snapshot: {
    summary: oldBackup
  },
  build
};

describe("settings remote backup slice", () => {
  it("creates the initial remote backup sync state", () => {
    expect(createInitialRemoteBackupSyncState()).toEqual({
      status: "idle",
      latestRemoteBackup: null,
      history: [],
      lastComparison: null,
      lastCheckedAt: null,
      lastError: null
    });
  });

  it("maps identical comparison to up_to_date sync status", () => {
    expect(mapComparisonResultToSyncStatus("identical")).toBe("up_to_date");
    expect(mapComparisonResultToSyncStatus("diverged")).toBe("diverged");
  });

  it("replaces matching snapshots inside history and comparison state", () => {
    expect(applyRemoteBackupSnapshotToHistory([oldBackup], updatedBackup)).toEqual([
      updatedBackup
    ]);
    expect(
      applyRemoteBackupSnapshotToComparison(comparison, updatedBackup)
    ).toMatchObject({
      remote_snapshot: {
        summary: updatedBackup
      }
    });
  });
});
