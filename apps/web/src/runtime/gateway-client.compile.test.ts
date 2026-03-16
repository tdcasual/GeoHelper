import { afterEach, describe, expect, it, vi } from "vitest";

import { createGatewayClient } from "./gateway-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("gateway runtime client compile flows", () => {
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
