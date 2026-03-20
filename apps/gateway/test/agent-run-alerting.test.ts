import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildServer } from "../src/server";
import { createMemoryCompileEventSink } from "../src/services/compile-events";
import { resetGatewayMetrics } from "../src/services/metrics";
import { clearRateLimits } from "../src/services/rate-limit";
import {
  createGeometryAgentResponder,
  createGeometryDraftFixture,
  createGeometryReviewFixture
} from "./helpers/geometry-agent-stub";

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

describe("agent run alerting", () => {
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

  it("does not send webhook for a normal agent run success", async () => {
    const compileEventSink = createMemoryCompileEventSink();
    const app = buildServer(buildAlertEnv(), {
      compileEventSink,
      requestCommandBatch: createGeometryAgentResponder()
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: { message: "画一个圆", mode: "byok" }
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).trace_id).toBe("tr_req-1");
    expect(res.headers["x-trace-id"]).toBe("tr_req-1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(compileEventSink.readAll()).toEqual([
      expect.objectContaining({
        event: "compile_success",
        requestId: "req-1",
        traceId: "tr_req-1",
        path: "/api/v2/agent/runs",
        mode: "byok",
        finalStatus: "success"
      })
    ]);
  });

  it("writes repair events and sends repair alert webhook for agent runs", async () => {
    const compileEventSink = createMemoryCompileEventSink();
    const app = buildServer(buildAlertEnv(), {
      compileEventSink,
      requestCommandBatch: createGeometryAgentResponder({
        drafts: [
          createGeometryDraftFixture({
            commandBatchDraft: {
              version: "1.0",
              scene_id: "scene_repair_before",
              transaction_id: "tx_repair_before",
              commands: [
                {
                  id: "c1",
                  op: "create_line",
                  args: {
                    from: "A",
                    to: "A"
                  },
                  depends_on: [],
                  idempotency_key: "k1"
                }
              ],
              post_checks: [],
              explanations: []
            }
          }),
          createGeometryDraftFixture({
            commandBatchDraft: {
              version: "1.0",
              scene_id: "scene_repair_after",
              transaction_id: "tx_repair_after",
              commands: [],
              post_checks: [],
              explanations: []
            }
          })
        ],
        reviews: [
          createGeometryReviewFixture({
            verdict: "revise",
            summary: ["命令需要修复"],
            repairInstructions: ["重新生成一份可执行草案"]
          }),
          createGeometryReviewFixture()
        ]
      })
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
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
    expect(body.metadata).toEqual(
      expect.objectContaining({
        repair: true
      })
    );

    const events = compileEventSink.readAll();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "compile_success",
          requestId: "req-1",
          traceId: "tr_req-1",
          path: "/api/v2/agent/runs",
          mode: "byok",
          finalStatus: "repair"
        }),
        expect.objectContaining({
          event: "compile_repair",
          requestId: "req-1",
          traceId: "tr_req-1",
          path: "/api/v2/agent/runs",
          mode: "byok",
          finalStatus: "repair"
        })
      ])
    );
  });

  it("sends timeout alerts for timed-out agent runs", async () => {
    const compileEventSink = createMemoryCompileEventSink();
    const app = buildServer(
      buildAlertEnv({
        COMPILE_TIMEOUT_MS: "20"
      }),
      {
        compileEventSink,
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
      url: "/api/v2/agent/runs",
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

    const events = compileEventSink.readAll();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "compile_timeout",
          requestId: "req-1",
          traceId: "tr_req-1",
          path: "/api/v2/agent/runs",
          mode: "byok",
          finalStatus: "timeout",
          statusCode: 504
        })
      ])
    );
  });

  it("sends runtime-rejected alerts when agent run capacity is full", async () => {
    const compileEventSink = createMemoryCompileEventSink();
    let resolveFirstCall: (() => void) | undefined;
    const firstCallStarted = new Promise<void>((resolve) => {
      resolveFirstCall = resolve;
    });
    let releaseFirstCall: (() => void) | undefined;
    const firstCallGate = new Promise<void>((resolve) => {
      releaseFirstCall = resolve;
    });
    let invocationCount = 0;

    const app = buildServer(
      buildAlertEnv({
        COMPILE_MAX_IN_FLIGHT: "1"
      }),
      {
        compileEventSink,
        requestCommandBatch: createGeometryAgentResponder({
          drafts: [
            createGeometryDraftFixture({
              commandBatchDraft: {
                version: "1.0",
                scene_id: "s1",
                transaction_id: "t1",
                commands: [],
                post_checks: [],
                explanations: []
              }
            })
          ],
          onRequest: async (input) => {
            if (input.systemPrompt?.includes("GeometryDraftPackage")) {
              invocationCount += 1;
              if (invocationCount === 1) {
                resolveFirstCall?.();
                await firstCallGate;
              }
            }
          }
        })
      }
    );

    const firstResponsePromise = app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: { message: "画一个圆", mode: "byok" }
    });
    await firstCallStarted;

    const secondResponse = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: { message: "再画一个圆", mode: "byok" }
    });

    expect(secondResponse.statusCode).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"));
    expectCommonAlertPayload(body, {
      event: "compile_runtime_rejected",
      finalStatus: "runtime_rejected",
      traceId: "tr_req-2",
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

    const events = compileEventSink.readAll();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "compile_runtime_rejected",
          requestId: "req-2",
          traceId: "tr_req-2",
          path: "/api/v2/agent/runs",
          mode: "byok",
          finalStatus: "runtime_rejected",
          statusCode: 503
        })
      ])
    );

    releaseFirstCall?.();
    const firstResponse = await firstResponsePromise;
    expect(firstResponse.statusCode).toBe(200);
  });

  it("sends upstream failure alerts for agent run failures", async () => {
    const compileEventSink = createMemoryCompileEventSink();
    const app = buildServer(buildAlertEnv(), {
      compileEventSink,
      requestCommandBatch: async () => {
        throw new Error("broken upstream");
      }
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
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
    expect(body.detail).toBe("broken upstream");

    const events = compileEventSink.readAll();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "compile_upstream_failure",
          requestId: "req-1",
          traceId: "tr_req-1",
          path: "/api/v2/agent/runs",
          mode: "byok",
          finalStatus: "upstream_failure",
          statusCode: 502
        })
      ])
    );
  });
});
