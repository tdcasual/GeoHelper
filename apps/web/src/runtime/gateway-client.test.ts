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

describe("gateway runtime client", () => {
  it("calls gateway compile endpoint with auth and byok headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        trace_id: "tr_1",
        batch: {
          version: "1.0",
          scene_id: "scene_1",
          transaction_id: "tx_1",
          commands: [],
          post_checks: [],
          explanations: []
        },
        agent_steps: []
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createGatewayClient();
    await client.compile({
      target: "gateway",
      baseUrl: "https://gateway.example.com",
      mode: "official",
      sessionToken: "sess_x",
      message: "画一个圆",
      byokEndpoint: "https://proxy.example.com/v1",
      byokKey: "sk-test"
    });

    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe("https://gateway.example.com/api/v1/chat/compile");
    expect(call[1].headers).toMatchObject({
      authorization: "Bearer sess_x",
      "x-byok-endpoint": "https://proxy.example.com/v1",
      "x-byok-key": "sk-test"
    });
  });

  it("resolves gateway vision capability from runtime identity", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        git_sha: "sha123",
        build_time: "2026-03-12T00:00:00.000Z",
        node_env: "production",
        redis_enabled: true,
        attachments_enabled: true
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createGatewayClient() as ReturnType<typeof createGatewayClient> & {
      resolveCapabilities?: (params: { baseUrl?: string }) => Promise<{
        supportsOfficialAuth: boolean;
        supportsVision: boolean;
        supportsAgentSteps: boolean;
        supportsServerMetrics: boolean;
        supportsRateLimitHeaders: boolean;
      }>;
    };

    expect(client.resolveCapabilities).toBeTypeOf("function");
    await expect(
      client.resolveCapabilities?.({
        baseUrl: "https://gateway.example.com"
      })
    ).resolves.toMatchObject({
      supportsVision: true,
      supportsOfficialAuth: true
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://gateway.example.com/admin/version"
    );
  });

  it("falls back to default capabilities when admin version returns non-json html", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      }
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createGatewayClient() as ReturnType<typeof createGatewayClient> & {
      resolveCapabilities?: (params: { baseUrl?: string }) => Promise<{
        supportsOfficialAuth: boolean;
        supportsVision: boolean;
        supportsAgentSteps: boolean;
        supportsServerMetrics: boolean;
        supportsRateLimitHeaders: boolean;
      }>;
    };

    await expect(
      client.resolveCapabilities?.({
        baseUrl: "https://gateway.example.com"
      })
    ).resolves.toMatchObject({
      supportsVision: false,
      supportsOfficialAuth: true
    });
  });

  it("passes attachments through to gateway compile payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        trace_id: "tr_1",
        batch: {
          version: "1.0",
          scene_id: "scene_1",
          transaction_id: "tx_1",
          commands: [],
          post_checks: [],
          explanations: []
        },
        agent_steps: []
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createGatewayClient();
    await client.compile({
      target: "gateway",
      baseUrl: "https://gateway.example.com",
      mode: "byok",
      message: "看图生成几何步骤",
      attachments: [
        {
          id: "img_1",
          kind: "image",
          name: "triangle.png",
          mimeType: "image/png",
          size: 1234,
          transportPayload: "data:image/png;base64,AAAA"
        }
      ]
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(requestInit.body)) as {
      attachments?: Array<{ name: string; transportPayload: string }>;
    };
    expect(payload.attachments).toEqual([
      {
        id: "img_1",
        kind: "image",
        name: "triangle.png",
        mimeType: "image/png",
        size: 1234,
        transportPayload: "data:image/png;base64,AAAA"
      }
    ]);
  });

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
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe(
      "https://gateway.example.com/admin/backups/history/snap-history-1"
    );
    expect(call[1].method).toBe("GET");
    expect(call[1].headers).toMatchObject({
      "x-admin-token": "admin-secret"
    });
  });

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
            device_id: "device-1"
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
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe(
      "https://gateway.example.com/admin/backups/history?limit=2"
    );
    expect(call[1].method).toBe("GET");
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

  it("uses VITE_GATEWAY_URL as fallback base url", async () => {
    vi.stubEnv("VITE_GATEWAY_URL", "https://gateway.env.example.com");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        batch: {
          version: "1.0",
          scene_id: "scene_1",
          transaction_id: "tx_1",
          commands: [],
          post_checks: [],
          explanations: []
        }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createGatewayClient();
    await client.compile({
      target: "gateway",
      mode: "byok",
      message: "画一个圆"
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://gateway.env.example.com/api/v1/chat/compile"
    );
  });

  it("falls back to same-origin api path when gateway base url is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        batch: {
          version: "1.0",
          scene_id: "scene_1",
          transaction_id: "tx_1",
          commands: [],
          post_checks: [],
          explanations: []
        }
      })
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createGatewayClient();
    await client.compile({
      target: "gateway",
      mode: "byok",
      message: "画一个圆"
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/chat/compile");
  });
});
