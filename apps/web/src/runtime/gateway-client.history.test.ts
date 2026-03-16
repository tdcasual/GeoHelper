import { createBackupEnvelope } from "@geohelper/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createGatewayClient } from "./gateway-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const toLocalSummary = (envelope: ReturnType<typeof createBackupEnvelope>) => ({
  schema_version: envelope.schema_version,
  created_at: envelope.created_at,
  updated_at: envelope.updated_at,
  app_version: envelope.app_version,
  checksum: envelope.checksum,
  conversation_count: envelope.conversations.length,
  snapshot_id: envelope.snapshot_id,
  device_id: envelope.device_id,
  ...(envelope.base_snapshot_id
    ? { base_snapshot_id: envelope.base_snapshot_id }
    : {})
});

describe("gateway runtime client history routes", () => {
  it("fetches latest remote backup metadata through the history route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        history: [
          {
            stored_at: "2026-03-11T16:21:00.000Z",
            schema_version: 2,
            created_at: "2026-03-11T16:20:00.000Z",
            updated_at: "2026-03-11T16:20:00.000Z",
            app_version: "0.0.1",
            checksum: "checksum-remote",
            conversation_count: 1,
            snapshot_id: "snap-remote",
            device_id: "device-remote"
          }
        ],
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

    const client = createGatewayClient() as ReturnType<typeof createGatewayClient> & {
      fetchLatestBackupMetadata?: (params: {
        baseUrl?: string;
        adminToken?: string;
      }) => Promise<{
        backup: {
          snapshot_id: string;
        } | null;
      }>;
    };

    expect(client.fetchLatestBackupMetadata).toBeTypeOf("function");
    const response = await client.fetchLatestBackupMetadata?.({
      baseUrl: "https://gateway.example.com",
      adminToken: "admin-secret"
    });

    expect(response?.backup?.snapshot_id).toBe("snap-remote");
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe(
      "https://gateway.example.com/admin/backups/history?limit=1"
    );
    expect(call[1].method).toBe("GET");
    expect(call[1].headers).toMatchObject({
      "x-admin-token": "admin-secret"
    });
  });

  it("fetches remote backup history summaries without downloading envelopes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        history: [
          {
            stored_at: "2026-03-11T16:22:00.000Z",
            schema_version: 2,
            created_at: "2026-03-11T16:21:00.000Z",
            updated_at: "2026-03-11T16:21:00.000Z",
            app_version: "0.0.1",
            checksum: "checksum-2",
            conversation_count: 2,
            snapshot_id: "snap-2",
            device_id: "device-2",
            is_protected: true,
            protected_at: "2026-03-11T16:22:30.000Z",
            base_snapshot_id: "snap-1"
          },
          {
            stored_at: "2026-03-11T16:21:00.000Z",
            schema_version: 2,
            created_at: "2026-03-11T16:20:00.000Z",
            updated_at: "2026-03-11T16:20:00.000Z",
            app_version: "0.0.1",
            checksum: "checksum-1",
            conversation_count: 1,
            snapshot_id: "snap-1",
            device_id: "device-1",
            is_protected: false
          }
        ],
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

    const client = createGatewayClient() as ReturnType<typeof createGatewayClient> & {
      fetchBackupHistory?: (params: {
        baseUrl?: string;
        adminToken?: string;
        limit?: number;
      }) => Promise<{
        history: Array<{ snapshot_id: string }>;
      }>;
    };

    expect(client.fetchBackupHistory).toBeTypeOf("function");
    const response = await client.fetchBackupHistory?.({
      baseUrl: "https://gateway.example.com",
      adminToken: "admin-secret",
      limit: 2
    });

    expect(response?.history.map((item) => item.snapshot_id)).toEqual([
      "snap-2",
      "snap-1"
    ]);
    expect(response?.history[0]).toMatchObject({
      is_protected: true,
      protected_at: "2026-03-11T16:22:30.000Z"
    });
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe(
      "https://gateway.example.com/admin/backups/history?limit=2"
    );
    expect(call[1].method).toBe("GET");
  });

  it("protects a retained remote snapshot through the admin route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        protection_status: "protected",
        backup: {
          stored_at: "2026-03-11T16:22:00.000Z",
          schema_version: 2,
          created_at: "2026-03-11T16:21:00.000Z",
          updated_at: "2026-03-11T16:21:00.000Z",
          app_version: "0.0.1",
          checksum: "checksum-2",
          conversation_count: 2,
          snapshot_id: "snap-2",
          device_id: "device-2",
          is_protected: true,
          protected_at: "2026-03-11T16:23:00.000Z"
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

    const client = createGatewayClient() as ReturnType<typeof createGatewayClient> & {
      protectBackupSnapshot?: (params: {
        baseUrl?: string;
        adminToken?: string;
        snapshotId: string;
      }) => Promise<{
        protection_status: "protected" | "limit_reached";
        backup?: { snapshot_id: string; is_protected: boolean };
      }>;
    };

    expect(client.protectBackupSnapshot).toBeTypeOf("function");
    const response = await client.protectBackupSnapshot?.({
      baseUrl: "https://gateway.example.com",
      adminToken: "admin-secret",
      snapshotId: "snap-2"
    });

    expect(response).toMatchObject({
      protection_status: "protected",
      backup: {
        snapshot_id: "snap-2",
        is_protected: true
      }
    });
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe(
      "https://gateway.example.com/admin/backups/history/snap-2/protect"
    );
    expect(call[1].method).toBe("POST");
    expect(call[1].headers).toMatchObject({
      "x-admin-token": "admin-secret"
    });
  });

  it("returns a structured limit response when protected snapshot capacity is full", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 409,
      ok: false,
      json: async () => ({
        protection_status: "limit_reached",
        snapshot_id: "snap-2",
        protected_count: 1,
        max_protected: 1,
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

    const client = createGatewayClient() as ReturnType<typeof createGatewayClient> & {
      protectBackupSnapshot?: (params: {
        baseUrl?: string;
        adminToken?: string;
        snapshotId: string;
      }) => Promise<{
        protection_status: "protected" | "limit_reached";
        snapshot_id?: string;
        protected_count?: number;
        max_protected?: number;
      }>;
    };

    const response = await client.protectBackupSnapshot?.({
      baseUrl: "https://gateway.example.com",
      adminToken: "admin-secret",
      snapshotId: "snap-2"
    });

    expect(response).toEqual({
      protection_status: "limit_reached",
      snapshot_id: "snap-2",
      protected_count: 1,
      max_protected: 1,
      build: {
        git_sha: "backupsha",
        build_time: "2026-03-11T16:19:00.000Z",
        node_env: "production",
        redis_enabled: true,
        attachments_enabled: false
      }
    });
  });

  it("unprotects a retained remote snapshot through the admin route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        protection_status: "unprotected",
        backup: {
          stored_at: "2026-03-11T16:22:00.000Z",
          schema_version: 2,
          created_at: "2026-03-11T16:21:00.000Z",
          updated_at: "2026-03-11T16:21:00.000Z",
          app_version: "0.0.1",
          checksum: "checksum-2",
          conversation_count: 2,
          snapshot_id: "snap-2",
          device_id: "device-2",
          is_protected: false
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

    const client = createGatewayClient() as ReturnType<typeof createGatewayClient> & {
      unprotectBackupSnapshot?: (params: {
        baseUrl?: string;
        adminToken?: string;
        snapshotId: string;
      }) => Promise<{
        protection_status: "unprotected";
        backup: { snapshot_id: string; is_protected: boolean };
      }>;
    };

    const response = await client.unprotectBackupSnapshot?.({
      baseUrl: "https://gateway.example.com",
      adminToken: "admin-secret",
      snapshotId: "snap-2"
    });

    expect(response).toMatchObject({
      protection_status: "unprotected",
      backup: {
        snapshot_id: "snap-2",
        is_protected: false
      }
    });
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe(
      "https://gateway.example.com/admin/backups/history/snap-2/protect"
    );
    expect(call[1].method).toBe("DELETE");
  });

  it("posts local snapshot summaries to compare against the remote latest snapshot", async () => {
    const envelope = createBackupEnvelope(
      {
        conversations: [{ id: "conv_local", title: "Local backup" }],
        settings: { defaultMode: "byok" }
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-11T16:20:00.000Z",
        updatedAt: "2026-03-11T16:20:00.000Z",
        appVersion: "0.0.1",
        snapshotId: "snap-local",
        deviceId: "device-local"
      }
    );
    const localSummary = toLocalSummary(envelope);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        local_status: "summary",
        remote_status: "available",
        comparison_result: "remote_newer",
        local_snapshot: {
          summary: localSummary
        },
        remote_snapshot: {
          summary: {
            stored_at: "2026-03-11T16:22:00.000Z",
            schema_version: 2,
            created_at: "2026-03-11T16:21:00.000Z",
            updated_at: "2026-03-11T16:21:00.000Z",
            app_version: "0.0.1",
            checksum: "checksum-remote",
            conversation_count: 2,
            snapshot_id: "snap-remote",
            device_id: "device-remote",
            base_snapshot_id: "snap-local"
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

    const client = createGatewayClient() as ReturnType<typeof createGatewayClient> & {
      compareBackup?: (params: {
        baseUrl?: string;
        adminToken?: string;
        localSummary: typeof localSummary;
      }) => Promise<{
        comparison_result: string;
        remote_snapshot: { summary: { snapshot_id: string } } | null;
      }>;
    };

    expect(client.compareBackup).toBeTypeOf("function");
    const response = await client.compareBackup?.({
      baseUrl: "https://gateway.example.com",
      adminToken: "admin-secret",
      localSummary
    });

    expect(response?.comparison_result).toBe("remote_newer");
    expect(response?.remote_snapshot?.summary.snapshot_id).toBe("snap-remote");
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe("https://gateway.example.com/admin/backups/compare");
    expect(call[1].method).toBe("POST");
    expect(call[1].headers).toMatchObject({
      "content-type": "application/json",
      "x-admin-token": "admin-secret"
    });
    expect(JSON.parse(String(call[1].body))).toEqual({
      local_summary: localSummary
    });
  });
});
