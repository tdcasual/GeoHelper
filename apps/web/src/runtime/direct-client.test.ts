import { afterEach, describe, expect, it, vi } from "vitest";

import { createDirectClient } from "./direct-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("direct runtime client", () => {
  it("compiles through openai-compatible endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                version: "1.0",
                scene_id: "scene_1",
                transaction_id: "tx_1",
                commands: [],
                post_checks: [],
                explanations: []
              })
            }
          }
        ]
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createDirectClient();
    const result = await client.compile({
      target: "direct",
      mode: "byok",
      message: "画一个圆",
      byokEndpoint: "https://openrouter.ai/api/v1",
      byokKey: "sk-live",
      model: "openai/gpt-4o-mini"
    });

    expect(result.batch.scene_id).toBe("scene_1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws runtime configuration error when endpoint is missing", async () => {
    const client = createDirectClient();

    await expect(
      client.compile({
        target: "direct",
        mode: "byok",
        message: "画一个圆",
        byokKey: "sk-live"
      })
    ).rejects.toMatchObject({
      code: "RUNTIME_NOT_CONFIGURED"
    });
  });

  it("maps browser blocked request to CORS error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const client = createDirectClient();

    await expect(
      client.compile({
        target: "direct",
        mode: "byok",
        message: "画一个圆",
        byokEndpoint: "https://openrouter.ai/api/v1",
        byokKey: "sk-live"
      })
    ).rejects.toMatchObject({
      code: "CORS_BLOCKED"
    });
  });
});
