import { createBackupEnvelope } from "@geohelper/protocol";
import { describe, expect, it, vi } from "vitest";

import { readRemoteSyncReadyConfig } from "./remote-sync-config";
import {
  runRemoteSyncDelayedUpload,
  runRemoteSyncMetadataProbe
} from "./remote-sync-runner";

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
    is_protected: boolean;
    protected_at: string;
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
  device_id: overrides.device_id ?? envelope.device_id,
  is_protected: overrides.is_protected ?? false,
  ...(overrides.protected_at
    ? { protected_at: overrides.protected_at }
    : {})
});

describe("remote-sync runner", () => {
  it("returns null config when mode, baseUrl, or token is incomplete", async () => {
    await expect(
      readRemoteSyncReadyConfig({
        getSyncMode: () => "off",
        getGatewayBaseUrl: () => "https://gateway.example.com",
        readAdminToken: vi.fn(async () => "admin-secret")
      })
    ).resolves.toBeNull();

    await expect(
      readRemoteSyncReadyConfig({
        getSyncMode: () => "remind_only",
        getGatewayBaseUrl: () => "",
        readAdminToken: vi.fn(async () => "admin-secret")
      })
    ).resolves.toBeNull();

    await expect(
      readRemoteSyncReadyConfig({
        getSyncMode: () => "delayed_upload",
        getGatewayBaseUrl: () => "https://gateway.example.com",
        readAdminToken: vi.fn(async () => null)
      })
    ).resolves.toBeNull();
  });

  it("publishes metadata probe results with history and comparison", async () => {
    const envelope = createLocalEnvelope();
    const remoteSummary = toRemoteMetadata(envelope, {
      checksum: "checksum-remote",
      snapshot_id: "snap-remote",
      device_id: "device-remote"
    });
    const beginRemoteBackupSyncCheck = vi.fn();
    const setRemoteBackupSyncResult = vi.fn();

    await runRemoteSyncMetadataProbe(
      {
        exportLocalBackupEnvelope: vi.fn(async () => envelope),
        fetchBackupHistory: vi.fn(async () => ({
          history: [remoteSummary],
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T10:05:30.000Z",
            node_env: "test",
            redis_enabled: true,
            attachments_enabled: false
          }
        })),
        compareBackup: vi.fn(async () => ({
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
        })),
        beginRemoteBackupSyncCheck,
        setRemoteBackupSyncResult,
        nowIso: () => "2026-03-16T00:00:00.000Z"
      },
      {
        mode: "remind_only",
        baseUrl: "https://gateway.example.com",
        adminToken: "admin-secret"
      }
    );

    expect(beginRemoteBackupSyncCheck).toHaveBeenCalledTimes(1);
    expect(setRemoteBackupSyncResult).toHaveBeenCalledWith(
      expect.objectContaining({
        latestRemoteBackup: remoteSummary,
        history: [remoteSummary],
        checkedAt: "2026-03-16T00:00:00.000Z"
      })
    );
  });

  it("marks upload_blocked_remote_newer when compare result is remote_newer", async () => {
    const envelope = createLocalEnvelope();
    const remoteSummary = toRemoteMetadata(envelope, {
      checksum: "checksum-remote",
      snapshot_id: "snap-remote",
      device_id: "device-remote"
    });
    const setRemoteBackupSyncResult = vi.fn();

    await runRemoteSyncDelayedUpload(
      {
        exportLocalBackupEnvelope: vi.fn(async () => envelope),
        compareBackup: vi.fn(async () => ({
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
        })),
        fetchBackupHistory: vi.fn(async () => ({
          history: [remoteSummary],
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T10:05:30.000Z",
            node_env: "test",
            redis_enabled: true,
            attachments_enabled: false
          }
        })),
        uploadBackupGuarded: vi.fn(),
        beginRemoteBackupSyncUpload: vi.fn(),
        setRemoteBackupSyncResult,
        setRemoteBackupSyncError: vi.fn(),
        getRemoteBackupSyncState: () => ({
          status: "idle",
          latestRemoteBackup: remoteSummary,
          history: [remoteSummary],
          lastComparison: null,
          lastCheckedAt: null,
          lastError: null
        }),
        nowIso: () => "2026-03-16T00:00:00.000Z"
      },
      {
        mode: "delayed_upload",
        baseUrl: "https://gateway.example.com",
        adminToken: "admin-secret"
      }
    );

    expect(setRemoteBackupSyncResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "upload_blocked_remote_newer",
        latestRemoteBackup: remoteSummary,
        history: [remoteSummary],
        checkedAt: "2026-03-16T00:00:00.000Z"
      })
    );
  });
});
