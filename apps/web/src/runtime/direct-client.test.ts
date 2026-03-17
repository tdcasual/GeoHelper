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

    expect(result.agent_run.run.target).toBe("direct");
    expect(result.agent_run.draft.commandBatchDraft.scene_id).toBe("scene_1");
    expect(result.agent_run.teacherPacket.summary[0]).toContain("已生成");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serializes image attachments into multimodal user content", async () => {
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
    await client.compile({
      target: "direct",
      mode: "byok",
      message: "看图生成几何步骤",
      byokEndpoint: "https://openrouter.ai/api/v1",
      byokKey: "sk-live",
      model: "openai/gpt-4o",
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
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(Array.isArray(payload.messages[1]?.content)).toBe(true);
    expect(payload.messages[1]?.content).toEqual([
      { type: "text", text: "看图生成几何步骤" },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,AAAA" }
      }
    ]);
  });

  it("includes a direct-lite stage timeline in the returned agent run", async () => {
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
                explanations: ["已生成草案"]
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
      message: "作线段 AB 的中点 M",
      byokEndpoint: "https://openrouter.ai/api/v1",
      byokKey: "sk-live"
    });

    expect(result.agent_run.telemetry.stages).toEqual([
      expect.objectContaining({
        name: "author",
        status: "ok"
      })
    ]);
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
