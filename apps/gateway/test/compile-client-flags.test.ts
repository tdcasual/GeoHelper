import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildServer } from "../src/server";
import { resetGatewayMetrics } from "../src/services/metrics";
import { clearRateLimits } from "../src/services/rate-limit";
import { requestCommandBatch } from "../src/services/litellm-client";

describe("POST /api/v1/chat/compile client flags", () => {
  it("uses single-agent fallback path when requested", async () => {
    clearRateLimits();
    resetGatewayMetrics();

    let callCount = 0;
    const app = buildServer(
      {},
      {
        requestCommandBatch: async () => {
          callCount += 1;
          return {
            version: "1.0",
            scene_id: "s1",
            transaction_id: "t1",
            commands: [],
            post_checks: [],
            explanations: []
          };
        }
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      headers: {
        "x-client-fallback-single-agent": "1"
      },
      payload: {
        message: "画一个圆",
        mode: "byok"
      }
    });

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload.agent_steps).toHaveLength(1);
    expect(payload.agent_steps[0].name).toBe("command");
    expect(payload.agent_steps[0].status).toBe("ok");
    expect(callCount).toBe(1);
  });

  it("returns perf headers when performance sampling is requested", async () => {
    clearRateLimits();
    resetGatewayMetrics();

    const app = buildServer(
      {},
      {
        requestCommandBatch: async () => ({
          version: "1.0",
          scene_id: "s1",
          transaction_id: "t1",
          commands: [],
          post_checks: [],
          explanations: []
        })
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      headers: {
        "x-client-performance-sampling": "1"
      },
      payload: {
        message: "画一个圆",
        mode: "byok"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(Number(res.headers["x-perf-total-ms"])).toBeGreaterThanOrEqual(0);
    expect(Number(res.headers["x-perf-upstream-ms"])).toBeGreaterThanOrEqual(0);
  });

  it("forwards context payload in single-agent fallback mode", async () => {
    clearRateLimits();
    resetGatewayMetrics();

    let capturedInput:
      | {
          context?: {
            recentMessages?: Array<{ role: "user" | "assistant"; content: string }>;
            sceneTransactions?: Array<{ sceneId: string; transactionId: string; commandCount: number }>;
          };
        }
      | undefined;

    const app = buildServer(
      {},
      {
        requestCommandBatch: async (input) => {
          capturedInput = input as typeof capturedInput;
          return {
            version: "1.0",
            scene_id: "s1",
            transaction_id: "t1",
            commands: [],
            post_checks: [],
            explanations: []
          };
        }
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      headers: {
        "x-client-fallback-single-agent": "1"
      },
      payload: {
        message: "画一个圆",
        mode: "byok",
        context: {
          recent_messages: [
            { role: "user", content: "先创建点A" },
            { role: "assistant", content: "已创建点A" }
          ],
          scene_transactions: [
            {
              scene_id: "s1",
              transaction_id: "tx1",
              command_count: 2
            }
          ]
        }
      }
    });

    expect(res.statusCode).toBe(200);
    expect(capturedInput?.context?.recentMessages).toHaveLength(2);
    expect(capturedInput?.context?.sceneTransactions?.[0]?.transactionId).toBe(
      "tx1"
    );
  });
});

describe("requestCommandBatch upstream fallback routing", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock
    });
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: originalFetch
    });
    process.env = { ...originalEnv };
  });

  it("retries transient upstream failures against configured fallback endpoint and model", async () => {
    process.env.LITELLM_ENDPOINT = "https://primary.example.com";
    process.env.LITELLM_API_KEY = "primary-key";
    process.env.LITELLM_MODEL = "primary-model";
    process.env.LITELLM_FALLBACK_ENDPOINT = "https://fallback.example.com";
    process.env.LITELLM_FALLBACK_API_KEY = "fallback-key";
    process.env.LITELLM_FALLBACK_MODEL = "fallback-model";

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  version: "1.0",
                  scene_id: "s1",
                  transaction_id: "t1",
                  commands: [],
                  post_checks: [],
                  explanations: []
                })
              }
            }
          ]
        })
      });

    const result = await requestCommandBatch({
      message: "画一个圆",
      mode: "official"
    });

    expect(result).toMatchObject({
      scene_id: "s1",
      transaction_id: "t1"
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://primary.example.com/chat/completions"
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://fallback.example.com/chat/completions"
    );

    const firstRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const secondRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect((firstRequest.headers as Record<string, string>).authorization).toBe(
      "Bearer primary-key"
    );
    expect((secondRequest.headers as Record<string, string>).authorization).toBe(
      "Bearer fallback-key"
    );
    expect(JSON.parse(String(firstRequest.body)).model).toBe("primary-model");
    expect(JSON.parse(String(secondRequest.body)).model).toBe(
      "fallback-model"
    );
  });
});
