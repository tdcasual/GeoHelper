import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildServer } from "../src/server";
import {
  createMemoryCompileEventSink
} from "../src/services/compile-events";
import { resetGatewayMetrics } from "../src/services/metrics";
import { clearRateLimits } from "../src/services/rate-limit";

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
      {
        ALERT_WEBHOOK_URL: "https://alerts.example.com/hook"
      },
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
    expect(body.event).toBe("compile_fallback");
    expect(body.traceId).toBe("tr_req-1");
    expect(body.path).toBe("/api/v1/chat/compile");

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
      {
        ALERT_WEBHOOK_URL: "https://alerts.example.com/hook"
      },
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
    expect(body.event).toBe("compile_repair");
    expect(body.traceId).toBe("tr_req-1");
    expect(body.path).toBe("/api/v1/chat/compile");

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
});
