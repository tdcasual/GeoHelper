import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createGatewayClient } from "./gateway-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("gateway runtime client facade", () => {
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

  it("keeps the gateway client facade suite below the test maintainability budget", async () => {
    const code = await readFile(new URL("./gateway-client.test.ts", import.meta.url), "utf-8");
    expect(code.split(/\r?\n/).length).toBeLessThan(260);
  });
});
