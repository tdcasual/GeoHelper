import { createBackupEnvelope } from "@geohelper/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createGatewayClient } from "./gateway-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("gateway runtime client backup routes", () => {
  it("uploads the latest backup envelope through the admin backup route", async () => {
    const envelope = createBackupEnvelope(
      {
        conversations: [{ id: "conv_remote", title: "Remote backup" }],
        settings: { defaultMode: "byok" }
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-11T16:20:00.000Z",
        updatedAt: "2026-03-11T16:20:00.000Z",
        appVersion: "0.0.1",
        snapshotId: "snap_remote",
        deviceId: "device_remote"
      }
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        backup: {
          stored_at: "2026-03-11T16:21:00.000Z",
          schema_version: 2,
          created_at: "2026-03-11T16:20:00.000Z",
          updated_at: "2026-03-11T16:20:00.000Z",
          app_version: "0.0.1",
          checksum: envelope.checksum,
          conversation_count: 1,
          snapshot_id: envelope.snapshot_id,
          device_id: envelope.device_id
        },
        build: {
          git_sha: "backupsha",
          build_time: "2026-03-11T16:19:00.000Z",
          node_env: "production",
          redis_enabled: true,
          attachments_enabled: false
        }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createGatewayClient();
    const response = await client.uploadBackup({
      baseUrl: "https://gateway.example.com",
      adminToken: "admin-secret",
      envelope
    });

    expect(response.backup.stored_at).toBe("2026-03-11T16:21:00.000Z");
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe("https://gateway.example.com/admin/backups/latest");
    expect(call[1].method).toBe("PUT");
    expect(call[1].headers).toMatchObject({
      "content-type": "application/json",
      "x-admin-token": "admin-secret"
    });
    expect(JSON.parse(String(call[1].body))).toEqual(envelope);
  });

  it("uploads guarded backups through the dedicated guarded route", async () => {
    const envelope = createBackupEnvelope(
      {
        conversations: [{ id: "conv_guarded", title: "Guarded backup" }],
        settings: { defaultMode: "byok" }
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-11T16:20:00.000Z",
        updatedAt: "2026-03-11T16:20:00.000Z",
        appVersion: "0.0.1",
        snapshotId: "snap-guarded",
        deviceId: "device-guarded"
      }
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        guarded_write: "written",
        backup: {
          stored_at: "2026-03-11T16:21:00.000Z",
          schema_version: 2,
          created_at: "2026-03-11T16:20:00.000Z",
          updated_at: "2026-03-11T16:20:00.000Z",
          app_version: "0.0.1",
          checksum: envelope.checksum,
          conversation_count: 1,
          snapshot_id: envelope.snapshot_id,
          device_id: envelope.device_id
        },
        build: {
          git_sha: "backupsha",
          build_time: "2026-03-11T16:19:00.000Z",
          node_env: "production",
          redis_enabled: true,
          attachments_enabled: false
        }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createGatewayClient();
    const response = await client.uploadBackupGuarded({
      baseUrl: "https://gateway.example.com",
      adminToken: "admin-secret",
      envelope,
      expectedRemoteSnapshotId: null
    });

    expect(response.guarded_write).toBe("written");
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe("https://gateway.example.com/admin/backups/guarded");
    expect(call[1].method).toBe("POST");
    expect(JSON.parse(String(call[1].body))).toEqual({
      envelope,
      expected_remote_snapshot_id: null
    });
  });

  it("returns guarded upload conflicts as data instead of throwing", async () => {
    const envelope = createBackupEnvelope(
      {
        conversations: [{ id: "conv_guarded", title: "Guarded backup" }],
        settings: { defaultMode: "byok" }
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-11T16:20:00.000Z",
        updatedAt: "2026-03-11T16:20:00.000Z",
        appVersion: "0.0.1",
        snapshotId: "snap-guarded",
        deviceId: "device-guarded"
      }
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        guarded_write: "conflict",
        comparison_result: "remote_newer",
        expected_remote_snapshot_id: "snap-previous",
        actual_remote_snapshot: {
          summary: {
            stored_at: "2026-03-11T16:22:00.000Z",
            schema_version: 2,
            created_at: "2026-03-11T16:21:00.000Z",
            updated_at: "2026-03-11T16:21:00.000Z",
            app_version: "0.0.1",
            checksum: "checksum-remote",
            conversation_count: 2,
            snapshot_id: "snap-remote",
            device_id: "device-remote"
          }
        },
        build: {
          git_sha: "backupsha",
          build_time: "2026-03-11T16:19:00.000Z",
          node_env: "production",
          redis_enabled: true,
          attachments_enabled: false
        }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createGatewayClient();
    const response = await client.uploadBackupGuarded({
      baseUrl: "https://gateway.example.com",
      adminToken: "admin-secret",
      envelope,
      expectedRemoteSnapshotId: "snap-previous",
      expectedRemoteChecksum: "checksum-previous"
    });

    expect(response).toEqual({
      guarded_write: "conflict",
      comparison_result: "remote_newer",
      expected_remote_snapshot_id: "snap-previous",
      actual_remote_snapshot: {
        summary: expect.objectContaining({
          snapshot_id: "snap-remote",
          checksum: "checksum-remote"
        })
      },
      build: expect.any(Object)
    });
  });

  it("downloads the latest remote backup envelope", async () => {
    const envelope = createBackupEnvelope(
      {
        conversations: [{ id: "conv_remote", title: "Remote backup" }],
        settings: { defaultMode: "byok" }
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-11T16:20:00.000Z",
        updatedAt: "2026-03-11T16:20:00.000Z",
        appVersion: "0.0.1",
        snapshotId: "snap_remote",
        deviceId: "device_remote"
      }
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        backup: {
          stored_at: "2026-03-11T16:21:00.000Z",
          schema_version: 2,
          created_at: "2026-03-11T16:20:00.000Z",
          updated_at: "2026-03-11T16:20:00.000Z",
          app_version: "0.0.1",
          checksum: envelope.checksum,
          conversation_count: 1,
          snapshot_id: envelope.snapshot_id,
          device_id: envelope.device_id,
          is_protected: false,
          envelope
        },
        build: {
          git_sha: "backupsha",
          build_time: "2026-03-11T16:19:00.000Z",
          node_env: "production",
          redis_enabled: true,
          attachments_enabled: false
        }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createGatewayClient();
    const response = await client.downloadBackup({
      baseUrl: "https://gateway.example.com",
      adminToken: "admin-secret"
    });

    expect(response.backup.envelope.checksum).toBe(envelope.checksum);
    expect(response.backup.is_protected).toBe(false);
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe("https://gateway.example.com/admin/backups/latest");
    expect(call[1].method).toBe("GET");
    expect(call[1].headers).toMatchObject({
      "x-admin-token": "admin-secret"
    });
  });

  it("downloads a selected remote backup snapshot by snapshot id", async () => {
    const envelope = createBackupEnvelope(
      {
        conversations: [{ id: "conv_history", title: "History backup" }],
        settings: { defaultMode: "byok" }
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-11T16:18:00.000Z",
        updatedAt: "2026-03-11T16:19:00.000Z",
        appVersion: "0.0.1",
        snapshotId: "snap-history-1",
        deviceId: "device-history"
      }
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        backup: {
          stored_at: "2026-03-11T16:21:00.000Z",
          schema_version: 2,
          created_at: "2026-03-11T16:18:00.000Z",
          updated_at: "2026-03-11T16:19:00.000Z",
          app_version: "0.0.1",
          checksum: envelope.checksum,
          conversation_count: 1,
          snapshot_id: envelope.snapshot_id,
          device_id: envelope.device_id,
          is_protected: true,
          protected_at: "2026-03-11T16:21:30.000Z",
          envelope
        },
        build: {
          git_sha: "backupsha",
          build_time: "2026-03-11T16:19:00.000Z",
          node_env: "production",
          redis_enabled: true,
          attachments_enabled: false
        }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createGatewayClient();
    const response = await client.downloadBackup({
      baseUrl: "https://gateway.example.com",
      adminToken: "admin-secret",
      snapshotId: envelope.snapshot_id
    } as Parameters<typeof client.downloadBackup>[0] & { snapshotId: string });

    expect(response.backup.snapshot_id).toBe("snap-history-1");
    expect(response.backup.envelope.snapshot_id).toBe("snap-history-1");
    expect(response.backup.is_protected).toBe(true);
    expect(response.backup.protected_at).toBe("2026-03-11T16:21:30.000Z");
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe(
      "https://gateway.example.com/admin/backups/history/snap-history-1"
    );
    expect(call[1].method).toBe("GET");
    expect(call[1].headers).toMatchObject({
      "x-admin-token": "admin-secret"
    });
  });
});
