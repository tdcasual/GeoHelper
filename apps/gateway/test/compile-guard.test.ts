import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildServer } from "../src/server";
import { createMemoryCompileEventSink } from "../src/services/compile-events";
import { resetGatewayMetrics } from "../src/services/metrics";
import { clearRateLimits } from "../src/services/rate-limit";
import {
  createGeometryAgentResponder,
  createGeometryDraftFixture
} from "./helpers/geometry-agent-stub";

describe("compile runtime guard", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn();

  beforeEach(() => {
    clearRateLimits();
    resetGatewayMetrics();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
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

  it("rejects overlapping compile requests once max in-flight is reached", async () => {
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
      {
        COMPILE_MAX_IN_FLIGHT: "1",
        ALERT_WEBHOOK_URL: "https://alerts.example.com/hook"
      },
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
      url: "/api/v1/chat/compile",
      payload: { message: "画一个圆", mode: "byok" }
    });
    await firstCallStarted;

    const secondResponse = await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      payload: { message: "再画一个圆", mode: "byok" }
    });

    expect(secondResponse.statusCode).toBe(503);
    expect(JSON.parse(secondResponse.payload)).toEqual({
      error: {
        code: "GATEWAY_BUSY",
        message: "Gateway compile capacity is full"
      }
    });
    expect(secondResponse.headers["x-trace-id"]).toBe("tr_req-2");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const busyAlert = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")
    );
    expect(busyAlert.event).toBe("compile_runtime_rejected");
    expect(busyAlert.traceId).toBe("tr_req-2");

    const events = compileEventSink.readAll();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "compile_runtime_rejected",
          requestId: "req-2",
          traceId: "tr_req-2",
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

  it("times out a hung upstream compile and returns a stable timeout error", async () => {
    const compileEventSink = createMemoryCompileEventSink();
    const app = buildServer(
      {
        COMPILE_TIMEOUT_MS: "20",
        ALERT_WEBHOOK_URL: "https://alerts.example.com/hook"
      },
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

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      headers: {
        "x-client-fallback-single-agent": "1"
      },
      payload: { message: "画一个圆", mode: "byok" }
    });

    expect(response.statusCode).toBe(504);
    expect(JSON.parse(response.payload)).toEqual({
      error: {
        code: "COMPILE_TIMEOUT",
        message: "Compile request exceeded gateway timeout"
      }
    });
    expect(response.headers["x-trace-id"]).toBe("tr_req-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const timeoutAlert = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")
    );
    expect(timeoutAlert.event).toBe("compile_timeout");
    expect(timeoutAlert.traceId).toBe("tr_req-1");

    const events = compileEventSink.readAll();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "compile_timeout",
          requestId: "req-1",
          traceId: "tr_req-1",
          mode: "byok",
          finalStatus: "timeout",
          statusCode: 504
        })
      ])
    );
  });
});
