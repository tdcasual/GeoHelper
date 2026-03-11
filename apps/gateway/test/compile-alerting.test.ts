import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildServer } from "../src/server";
import { createMemoryCompileEventSink } from "../src/services/compile-events";
import { resetGatewayMetrics } from "../src/services/metrics";
import { clearRateLimits } from "../src/services/rate-limit";

const buildAlertEnv = (overrides: Partial<NodeJS.ProcessEnv> = {}) => ({
  ALERT_WEBHOOK_URL: "https://alerts.example.com/hook",
  NODE_ENV: "development",
  GEOHELPER_BUILD_SHA: "gitsha-123456",
  GEOHELPER_BUILD_TIME: "2026-03-11T14:40:00.000Z",
  LITELLM_ENDPOINT: "https://litellm.primary.example.com",
  LITELLM_API_KEY: "primary-secret-key",
  LITELLM_MODEL: "gpt-4o-mini",
  LITELLM_FALLBACK_ENDPOINT: "https://litellm.fallback.example.com",
  LITELLM_FALLBACK_API_KEY: "fallback-secret-key",
  LITELLM_FALLBACK_MODEL: "gpt-4.1-mini",
  ...overrides
});

const expectCommonAlertPayload = (
  body: Record<string, unknown>,
  expected: {
    event: string;
    finalStatus: string;
    traceId: string;
    targets: Array<Record<string, string>>;
  }
) => {
  expect(body).toMatchObject({
    source: "geohelper-gateway",
    event: expected.event,
    finalStatus: expected.finalStatus,
    traceId: expected.traceId,
    git_sha: "gitsha-123456",
    build_time: "2026-03-11T14:40:00.000Z",
    node_env: "development",
    redis_enabled: false,
    upstream: {
      mode: "byok",
      targets: expected.targets
    }
  });
  expect(body.time).toEqual(expect.any(String));
  expect(JSON.stringify(body)).not.toContain("secret-key");
};

describe("compile alerting", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn();

  beforeEach(() => {
    clearRateLimits();
    resetGatewayMetrics();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: originalFetch
    });
  });

  it("writes fallback events and sends fallback alert webhook", async () => {
    const compileEventSink = createMemoryCompileEventSink();
    const app = buildServer(
      buildAlertEnv(),
      {
        compileEventSink,
        requestCommandBatch: async (input) => {
          if (input.message.startsWith("Intent extraction")) {
            throw new Error("intent unavailable");
          }
          if (input.message.startsWith("Planner output")) {
            throw new Error("planner unavailable");
          }
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
      payload: { message: "画一个圆", mode: "byok" }
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).trace_id).toBe("tr_req-1");
    expect(res.headers["x-trace-id"]).toBe("tr_req-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"));
    expectCommonAlertPayload(body, {
      event: "compile_fallback",
      finalStatus: "fallback",
      traceId: "tr_req-1",
      targets: [
        {
          source: "primary",
          endpoint: "https://litellm.primary.example.com",
          model: "gpt-4o-mini"
        },
        {
          source: "fallback",
          endpoint: "https://litellm.fallback.example.com",
          model: "gpt-4.1-mini"
        }
      ]
    });
    expect(body.path).toBe("/api/v1/chat/compile");
    expect(body.metadata).toEqual({
      fallback_steps: ["intent", "planner"]
    });

    const events = compileEventSink.readAll();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "compile_success",
          requestId: "req-1",
          traceId: "tr_req-1",
          mode: "byok",
          finalStatus: "fallback"
        }),
        expect.objectContaining({
          event: "compile_fallback",
          requestId: "req-1",
          traceId: "tr_req-1",
          mode: "byok",
          finalStatus: "fallback"
        })
      ])
    );

    const fallbackEvent = events.find((event) => event.event === "compile_fallback");
    expect(fallbackEvent?.upstreamCallCount).toBeGreaterThanOrEqual(1);
  });

  it("writes repair events and sends repair alert webhook", async () => {
    const compileEventSink = createMemoryCompileEventSink();
    let call = 0;
    const app = buildServer(
      buildAlertEnv(),
      {
        compileEventSink,
        requestCommandBatch: async () => {
          call += 1;
          if (call === 3) {
            return {
              version: "1.0",
              scene_id: "s1",
              transaction_id: "t1",
              commands: [
                {
                  id: "c1",
                  op: "eval_js",
                  args: {},
                  depends_on: [],
                  idempotency_key: "k1"
                }
              ],
              post_checks: [],
              explanations: []
            };
          }

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
      payload: { message: "画一个圆", mode: "byok" }
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).trace_id).toBe("tr_req-1");
    expect(res.headers["x-trace-id"]).toBe("tr_req-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"));
    expectCommonAlertPayload(body, {
      event: "compile_repair",
      finalStatus: "repair",
      traceId: "tr_req-1",
      targets: [
        {
          source: "primary",
          endpoint: "https://litellm.primary.example.com",
          model: "gpt-4o-mini"
        },
        {
          source: "fallback",
          endpoint: "https://litellm.fallback.example.com",
          model: "gpt-4.1-mini"
        }
      ]
    });
    expect(body.metadata).toEqual({
      repair: true
    });

    const events = compileEventSink.readAll();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "compile_success",
          requestId: "req-1",
          traceId: "tr_req-1",
          mode: "byok",
          finalStatus: "repair"
        }),
        expect.objectContaining({
          event: "compile_repair",
          requestId: "req-1",
          traceId: "tr_req-1",
          mode: "byok",
          finalStatus: "repair"
        })
      ])
    );

    const repairEvent = events.find((event) => event.event === "compile_repair");
    expect(repairEvent?.upstreamCallCount).toBeGreaterThanOrEqual(1);
  });

  it("sends timeout alerts with runtime identity and upstream context", async () => {
    const app = buildServer(
      buildAlertEnv({
        COMPILE_TIMEOUT_MS: "20"
      }),
      {
        requestCommandBatch: async () => {
          await new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error("upstream still hanging"));
            }, 200);
          });
          return null;
        }
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      headers: {
        "x-client-fallback-single-agent": "1"
      },
      payload: { message: "画一个圆", mode: "byok" }
    });

    expect(res.statusCode).toBe(504);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"));
    expectCommonAlertPayload(body, {
      event: "compile_timeout",
      finalStatus: "timeout",
      traceId: "tr_req-1",
      targets: [
        {
          source: "primary",
          endpoint: "https://litellm.primary.example.com",
          model: "gpt-4o-mini"
        },
        {
          source: "fallback",
          endpoint: "https://litellm.fallback.example.com",
          model: "gpt-4.1-mini"
        }
      ]
    });
    expect(body.metadata).toEqual({
      timeout_ms: 20
    });
  });

  it("sends operator failure alerts with runtime identity and upstream context", async () => {
    const app = buildServer(
      buildAlertEnv(),
      {
        requestCommandBatch: async () => {
          throw new Error("upstream hard failure");
        }
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      payload: { message: "画一个圆", mode: "byok" }
    });

    expect(res.statusCode).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"));
    expectCommonAlertPayload(body, {
      event: "compile_upstream_failure",
      finalStatus: "upstream_failure",
      traceId: "tr_req-1",
      targets: [
        {
          source: "primary",
          endpoint: "https://litellm.primary.example.com",
          model: "gpt-4o-mini"
        },
        {
          source: "fallback",
          endpoint: "https://litellm.fallback.example.com",
          model: "gpt-4.1-mini"
        }
      ]
    });
    expect(body.detail).toBe("upstream hard failure");
  });
});
