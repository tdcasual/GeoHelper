import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  RuntimeBackupComparableSummary,
  RuntimeBackupCompareResponse,
  RuntimeBackupComparisonResult,
  RuntimeBackupMetadata,
  RuntimeBackupRemoteStatus
} from "../runtime/types";
import { createSettingsStore } from "./settings-store";
import { createMemoryStorage } from "./settings-store.test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const createRemoteSummary = (
  overrides: Partial<RuntimeBackupMetadata> = {}
): RuntimeBackupMetadata => ({
  stored_at: "2026-03-12T10:00:00.000Z",
  schema_version: 2,
  created_at: "2026-03-12T09:58:00.000Z",
  updated_at: "2026-03-12T09:59:00.000Z",
  app_version: "0.0.1",
  checksum: "checksum-remote",
  conversation_count: 2,
  snapshot_id: "snap-remote",
  device_id: "device-remote",
  is_protected: false,
  ...overrides
});

const createLocalSummary = (
  overrides: Partial<RuntimeBackupComparableSummary> = {}
): RuntimeBackupComparableSummary => ({
  schema_version: 2,
  created_at: "2026-03-12T10:02:00.000Z",
  updated_at: "2026-03-12T10:02:00.000Z",
  app_version: "0.0.1",
  checksum: "checksum-local",
  conversation_count: 3,
  snapshot_id: "snap-local",
  device_id: "device-local",
  ...overrides
});

const createComparison = ({
  result,
  localSummary = createLocalSummary(),
  remoteSummary = createRemoteSummary(),
  remoteStatus = "available",
  buildTime = "2026-03-12T10:01:30.000Z"
}: {
  result: RuntimeBackupComparisonResult;
  localSummary?: RuntimeBackupComparableSummary;
  remoteSummary?: RuntimeBackupMetadata;
  remoteStatus?: RuntimeBackupRemoteStatus;
  buildTime?: string;
}): RuntimeBackupCompareResponse => ({
  local_status: "summary" as const,
  remote_status: remoteStatus,
  comparison_result: result,
  local_snapshot: {
    summary: localSummary
  },
  remote_snapshot:
    remoteStatus === "available"
      ? {
          summary: remoteSummary
        }
      : null,
  build: {
    git_sha: "backupsha",
    build_time: buildTime,
    node_env: "production",
    redis_enabled: true,
    attachments_enabled: false
  }
});

describe("settings-store remote sync", () => {
  it("persists lightweight cloud sync mode preference", () => {
    const originalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createMemoryStorage()
    });

    try {
      const store = createSettingsStore();
      expect(store.getState().remoteBackupSyncPreferences.mode).toBe("off");

      store.getState().setRemoteBackupSyncMode("delayed_upload");
      expect(store.getState().remoteBackupSyncPreferences.mode).toBe(
        "delayed_upload"
      );

      const reloaded = createSettingsStore();
      expect(reloaded.getState().remoteBackupSyncPreferences.mode).toBe(
        "delayed_upload"
      );
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: originalLocalStorage
      });
    }
  });

  it("tracks lightweight remote backup sync states from compare results", () => {
    const store = createSettingsStore();
    const remoteSummary = createRemoteSummary();

    expect(store.getState().remoteBackupSync.status).toBe("idle");

    store.getState().beginRemoteBackupSyncCheck();
    expect(store.getState().remoteBackupSync.status).toBe("checking");

    store.getState().setRemoteBackupSyncResult({
      latestRemoteBackup: remoteSummary,
      history: [remoteSummary],
      comparison: createComparison({
        result: "identical",
        remoteSummary,
        localSummary: createLocalSummary({
          created_at: "2026-03-12T09:58:00.000Z",
          updated_at: "2026-03-12T09:59:00.000Z",
          checksum: "checksum-remote",
          conversation_count: 2,
          snapshot_id: "snap-remote"
        }),
        buildTime: "2026-03-12T09:59:30.000Z"
      }),
      checkedAt: "2026-03-12T10:01:00.000Z"
    });
    expect(store.getState().remoteBackupSync.status).toBe("up_to_date");

    store.getState().setRemoteBackupSyncResult({
      comparison: createComparison({
        result: "local_newer",
        remoteSummary,
        remoteStatus: "missing",
        buildTime: "2026-03-12T10:02:30.000Z"
      })
    });
    expect(store.getState().remoteBackupSync.status).toBe("local_newer");

    store.getState().setRemoteBackupSyncResult({
      comparison: createComparison({
        result: "remote_newer",
        remoteSummary,
        buildTime: "2026-03-12T10:03:30.000Z"
      })
    });
    expect(store.getState().remoteBackupSync.status).toBe("remote_newer");

    store.getState().setRemoteBackupSyncResult({
      comparison: createComparison({
        result: "diverged",
        remoteSummary,
        localSummary: createLocalSummary({
          created_at: "2026-03-12T10:04:00.000Z",
          updated_at: "2026-03-12T10:04:00.000Z",
          checksum: "checksum-local-2",
          conversation_count: 4,
          snapshot_id: "snap-local-2"
        }),
        buildTime: "2026-03-12T10:04:30.000Z"
      })
    });
    expect(store.getState().remoteBackupSync.status).toBe("diverged");
    expect(store.getState().remoteBackupSync.history).toEqual([remoteSummary]);
    expect(store.getState().remoteBackupSync.latestRemoteBackup).toEqual(remoteSummary);
  });

  it("keeps gateway-unavailable sync checks explicit and non-fatal", () => {
    const store = createSettingsStore();

    store.getState().beginRemoteBackupSyncCheck();
    store.getState().setRemoteBackupSyncError("Gateway unavailable");

    expect(store.getState().remoteBackupSync.status).toBe("idle");
    expect(store.getState().remoteBackupSync.lastError).toBe(
      "Gateway unavailable"
    );
    expect(store.getState().remoteBackupSync.lastComparison).toBeNull();
  });

  it("tracks guarded upload statuses without dropping remote summary metadata", () => {
    const store = createSettingsStore();
    const remoteSummary = createRemoteSummary({
      stored_at: "2026-03-12T10:10:00.000Z",
      created_at: "2026-03-12T10:08:00.000Z",
      updated_at: "2026-03-12T10:09:00.000Z"
    });
    const comparison = createComparison({
      result: "remote_newer",
      remoteSummary,
      localSummary: createLocalSummary({
        created_at: "2026-03-12T10:08:00.000Z",
        updated_at: "2026-03-12T10:08:30.000Z",
        conversation_count: 1
      }),
      buildTime: "2026-03-12T10:10:30.000Z"
    });

    store.getState().beginRemoteBackupSyncUpload();
    expect(store.getState().remoteBackupSync.status).toBe("uploading");

    store.getState().setRemoteBackupSyncResult({
      status: "upload_blocked_remote_newer",
      latestRemoteBackup: remoteSummary,
      history: [remoteSummary],
      comparison,
      checkedAt: "2026-03-12T10:11:00.000Z"
    });
    expect(store.getState().remoteBackupSync.status).toBe(
      "upload_blocked_remote_newer"
    );
    expect(store.getState().remoteBackupSync.latestRemoteBackup).toEqual(
      remoteSummary
    );

    store.getState().setRemoteBackupSyncResult({
      status: "force_upload_required",
      comparison,
      checkedAt: "2026-03-12T10:12:00.000Z"
    });
    expect(store.getState().remoteBackupSync.status).toBe(
      "force_upload_required"
    );

    store.getState().setRemoteBackupSyncResult({
      status: "upload_conflict",
      comparison,
      checkedAt: "2026-03-12T10:13:00.000Z"
    });
    expect(store.getState().remoteBackupSync.status).toBe("upload_conflict");
    expect(store.getState().remoteBackupSync.latestRemoteBackup).toEqual(
      remoteSummary
    );
    expect(store.getState().remoteBackupSync.history).toEqual([remoteSummary]);
  });

  it("replaces stale blocked sync states with the next fresh compare result", () => {
    const store = createSettingsStore();
    const remoteSummary = createRemoteSummary({
      stored_at: "2026-03-12T10:10:00.000Z",
      created_at: "2026-03-12T10:08:00.000Z",
      updated_at: "2026-03-12T10:09:00.000Z"
    });

    store.getState().setRemoteBackupSyncResult({
      status: "upload_conflict",
      latestRemoteBackup: remoteSummary,
      history: [remoteSummary],
      comparison: createComparison({
        result: "diverged",
        remoteSummary,
        localSummary: createLocalSummary({
          created_at: "2026-03-12T10:08:00.000Z",
          updated_at: "2026-03-12T10:08:30.000Z",
          conversation_count: 1
        }),
        buildTime: "2026-03-12T10:10:30.000Z"
      }),
      checkedAt: "2026-03-12T10:11:00.000Z"
    });
    expect(store.getState().remoteBackupSync.status).toBe("upload_conflict");

    store.getState().setRemoteBackupSyncResult({
      latestRemoteBackup: remoteSummary,
      history: [remoteSummary],
      comparison: createComparison({
        result: "identical",
        remoteSummary,
        localSummary: createLocalSummary({
          created_at: "2026-03-12T10:09:00.000Z",
          updated_at: "2026-03-12T10:09:00.000Z",
          checksum: "checksum-remote",
          conversation_count: 2,
          snapshot_id: "snap-remote"
        }),
        buildTime: "2026-03-12T10:12:30.000Z"
      }),
      checkedAt: "2026-03-12T10:12:00.000Z"
    });

    expect(store.getState().remoteBackupSync.status).toBe("up_to_date");
    expect(store.getState().remoteBackupSync.history).toEqual([remoteSummary]);
    expect(store.getState().remoteBackupSync.latestRemoteBackup).toEqual(
      remoteSummary
    );
  });

  it("updates one retained remote snapshot after protect or unprotect without dropping compare state", () => {
    const store = createSettingsStore();
    const latestRemoteSummary = createRemoteSummary({
      stored_at: "2026-03-12T10:10:00.000Z",
      checksum: "checksum-latest",
      snapshot_id: "snap-latest",
      device_id: "device-latest"
    });
    const selectedRemoteSummary = createRemoteSummary({
      stored_at: "2026-03-12T10:00:00.000Z",
      checksum: "checksum-selected",
      conversation_count: 1,
      snapshot_id: "snap-selected",
      device_id: "device-selected"
    });

    store.getState().setRemoteBackupSyncResult({
      latestRemoteBackup: latestRemoteSummary,
      history: [latestRemoteSummary, selectedRemoteSummary],
      comparison: createComparison({
        result: "remote_newer",
        remoteSummary: latestRemoteSummary,
        localSummary: createLocalSummary({
          created_at: "2026-03-12T09:57:00.000Z",
          updated_at: "2026-03-12T09:57:30.000Z",
          conversation_count: 1
        }),
        buildTime: "2026-03-12T10:10:30.000Z"
      }),
      checkedAt: "2026-03-12T10:11:00.000Z"
    });

    store.getState().applyRemoteBackupSnapshotUpdate({
      ...selectedRemoteSummary,
      is_protected: true,
      protected_at: "2026-03-12T10:12:00.000Z"
    });

    expect(store.getState().remoteBackupSync.history).toEqual([
      latestRemoteSummary,
      {
        ...selectedRemoteSummary,
        is_protected: true,
        protected_at: "2026-03-12T10:12:00.000Z"
      }
    ]);
    expect(store.getState().remoteBackupSync.latestRemoteBackup).toEqual(
      latestRemoteSummary
    );
    expect(store.getState().remoteBackupSync.lastComparison).toMatchObject({
      remote_snapshot: {
        summary: latestRemoteSummary
      }
    });

    store.getState().applyRemoteBackupSnapshotUpdate(selectedRemoteSummary);
    expect(store.getState().remoteBackupSync.history).toEqual([
      latestRemoteSummary,
      selectedRemoteSummary
    ]);
  });
});
