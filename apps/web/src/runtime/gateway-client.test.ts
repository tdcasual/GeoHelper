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
