import { createBackupEnvelope } from "@geohelper/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createGatewayClient } from "./gateway-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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
