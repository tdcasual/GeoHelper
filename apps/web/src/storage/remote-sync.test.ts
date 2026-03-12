import { createBackupEnvelope } from "@geohelper/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRemoteSyncController } from "./remote-sync";

const createLocalEnvelope = () =>
  createBackupEnvelope(
    {
      conversations: [{ id: "conv_local", title: "Local conversation" }],
      settings: { defaultMode: "byok" }
    },
    {
      schemaVersion: 2,
      createdAt: "2026-03-12T09:59:00.000Z",
      updatedAt: "2026-03-12T10:01:00.000Z",
      appVersion: "0.0.1",
      snapshotId: "snap-local",
      deviceId: "device-local"
    }
  );

const toRemoteMetadata = (
  envelope: ReturnType<typeof createLocalEnvelope>,
  overrides: Partial<{
    stored_at: string;
    checksum: string;
    snapshot_id: string;
    device_id: string;
    conversation_count: number;
  }> = {}
) => ({
  stored_at: overrides.stored_at ?? "2026-03-12T10:05:00.000Z",
  schema_version: envelope.schema_version,
  created_at: envelope.created_at,
  updated_at: envelope.updated_at,
  app_version: envelope.app_version,
  checksum: overrides.checksum ?? envelope.checksum,
  conversation_count:
    overrides.conversation_count ?? envelope.conversations.length,
  snapshot_id: overrides.snapshot_id ?? envelope.snapshot_id,
  device_id: overrides.device_id ?? envelope.device_id
});

describe("remote sync controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips startup metadata probes when lightweight cloud sync is off", async () => {
    const envelope = createLocalEnvelope();
    const fetchBackupHistory = vi.fn();
    const compareBackup = vi.fn();

    const controller = createRemoteSyncController({
      getSyncMode: () => "off",
      getGatewayBaseUrl: () => "https://gateway.example.com",
      readAdminToken: vi.fn(async () => "admin-secret"),
      exportLocalBackupEnvelope: vi.fn(async () => envelope),
      fetchBackupHistory,
      compareBackup,
      uploadBackup: vi.fn(),
      beginRemoteBackupSyncCheck: vi.fn(),
      setRemoteBackupSyncResult: vi.fn(),
      setRemoteBackupSyncError: vi.fn(),
      uploadDelayMs: 5_000
    });

    await expect(controller.ensureStartupSyncCheck()).resolves.toBe(false);
    expect(fetchBackupHistory).not.toHaveBeenCalled();
    expect(compareBackup).not.toHaveBeenCalled();
  });

  it("runs only one startup metadata probe when gateway, token, and sync mode are ready", async () => {
    const envelope = createLocalEnvelope();
    const remoteSummary = toRemoteMetadata(envelope, {
      checksum: "checksum-remote",
      snapshot_id: "snap-remote",
      device_id: "device-remote"
    });
    const beginRemoteBackupSyncCheck = vi.fn();
    const setRemoteBackupSyncResult = vi.fn();
    const fetchBackupHistory = vi.fn(async () => ({
      history: [remoteSummary],
      build: {
        git_sha: "backupsha",
        build_time: "2026-03-12T10:05:30.000Z",
        node_env: "test",
        redis_enabled: true,
        attachments_enabled: false
      }
    }));
    const compareBackup = vi.fn(async () => ({
      local_status: "summary" as const,
      remote_status: "available" as const,
      comparison_result: "remote_newer" as const,
      local_snapshot: {
        summary: {
          schema_version: envelope.schema_version,
          created_at: envelope.created_at,
          updated_at: envelope.updated_at,
          app_version: envelope.app_version,
          checksum: envelope.checksum,
          conversation_count: envelope.conversations.length,
          snapshot_id: envelope.snapshot_id,
          device_id: envelope.device_id
        }
      },
      remote_snapshot: {
        summary: remoteSummary
      },
      build: {
        git_sha: "backupsha",
        build_time: "2026-03-12T10:05:30.000Z",
        node_env: "test",
        redis_enabled: true,
        attachments_enabled: false
      }
    }));

    const controller = createRemoteSyncController({
      getSyncMode: () => "remind_only",
      getGatewayBaseUrl: () => "https://gateway.example.com",
      readAdminToken: vi.fn(async () => "admin-secret"),
      exportLocalBackupEnvelope: vi.fn(async () => envelope),
      fetchBackupHistory,
      compareBackup,
      uploadBackup: vi.fn(),
      beginRemoteBackupSyncCheck,
      setRemoteBackupSyncResult,
      setRemoteBackupSyncError: vi.fn(),
      uploadDelayMs: 5_000
    });

    await Promise.all([
      controller.ensureStartupSyncCheck(),
      controller.ensureStartupSyncCheck()
    ]);

    expect(beginRemoteBackupSyncCheck).toHaveBeenCalledTimes(1);
    expect(fetchBackupHistory).toHaveBeenCalledTimes(1);
    expect(compareBackup).toHaveBeenCalledTimes(1);
    expect(setRemoteBackupSyncResult).toHaveBeenCalledTimes(1);
  });

  it("debounces delayed uploads and suppresses them while import is in progress", async () => {
    const envelope = createLocalEnvelope();
    const uploadBackup = vi.fn(async () => ({
      backup: toRemoteMetadata(envelope),
      build: {
        git_sha: "backupsha",
        build_time: "2026-03-12T10:05:30.000Z",
        node_env: "test",
        redis_enabled: true,
        attachments_enabled: false
      }
    }));

    const controller = createRemoteSyncController({
      getSyncMode: () => "delayed_upload",
      getGatewayBaseUrl: () => "https://gateway.example.com",
      readAdminToken: vi.fn(async () => "admin-secret"),
      exportLocalBackupEnvelope: vi.fn(async () => envelope),
      fetchBackupHistory: vi.fn(),
      compareBackup: vi.fn(),
      uploadBackup,
      beginRemoteBackupSyncCheck: vi.fn(),
      setRemoteBackupSyncResult: vi.fn(),
      setRemoteBackupSyncError: vi.fn(),
      uploadDelayMs: 5_000
    });

    controller.notifyLocalMutation();
    controller.notifyLocalMutation();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(uploadBackup).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(uploadBackup).toHaveBeenCalledTimes(1);

    controller.notifyLocalMutation();
    controller.setImportInProgress(true);
    await vi.runAllTimersAsync();
    expect(uploadBackup).toHaveBeenCalledTimes(1);

    controller.setImportInProgress(false);
    controller.notifyLocalMutation();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(uploadBackup).toHaveBeenCalledTimes(2);
  });
});
