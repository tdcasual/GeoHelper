import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { createMemoryCompileEventSink } from "../src/services/compile-events";

describe("GET /admin/traces/:traceId", () => {
  it("returns deterministic trace details from recorded compile events", async () => {
    const compileEventSink = createMemoryCompileEventSink();
    compileEventSink.write({
      event: "compile_fallback",
      finalStatus: "fallback",
      traceId: "tr_shared",
      requestId: "req-1",
      path: "/api/v2/agent/runs",
      method: "POST",
      mode: "byok",
      statusCode: 200,
      upstreamCallCount: 3,
      recordedAt: "2026-03-11T14:30:00.000Z"
    });
    compileEventSink.write({
      event: "compile_success",
      finalStatus: "fallback",
      traceId: "tr_shared",
      requestId: "req-1",
      path: "/api/v2/agent/runs",
      method: "POST",
      mode: "byok",
      statusCode: 200,
      upstreamCallCount: 3,
      recordedAt: "2026-03-11T14:30:01.000Z"
    });
    compileEventSink.write({
      event: "compile_success",
      finalStatus: "success",
      traceId: "tr_other",
      requestId: "req-2",
      path: "/api/v2/agent/runs",
      method: "POST",
      mode: "byok",
      statusCode: 200,
      upstreamCallCount: 1,
      recordedAt: "2026-03-11T14:30:02.000Z"
    });

    const app = buildServer({}, { compileEventSink });
    const res = await app.inject({
      method: "GET",
      url: "/admin/traces/tr_shared"
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      traceId: "tr_shared",
      requestId: "req-1",
      finalStatus: "fallback",
      mode: "byok",
      events: [
        expect.objectContaining({
          traceId: "tr_shared",
          requestId: "req-1",
          event: "compile_success",
          finalStatus: "fallback"
        }),
        expect.objectContaining({
          traceId: "tr_shared",
          requestId: "req-1",
          event: "compile_fallback",
          finalStatus: "fallback"
        })
      ]
    });
  });

  it("returns 404 when the trace does not exist", async () => {
    const app = buildServer({}, { compileEventSink: createMemoryCompileEventSink() });

    const res = await app.inject({
      method: "GET",
      url: "/admin/traces/tr_missing"
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.payload)).toEqual({
      error: {
        code: "TRACE_NOT_FOUND",
        message: "Trace was not found"
      }
    });
  });

  it("requires admin token when configured", async () => {
    const app = buildServer(
      {
        ADMIN_METRICS_TOKEN: "secret-metrics-token"
      },
      {
        compileEventSink: createMemoryCompileEventSink()
      }
    );

    const forbidden = await app.inject({
      method: "GET",
      url: "/admin/traces/tr_shared"
    });
    expect(forbidden.statusCode).toBe(403);

    const allowed = await app.inject({
      method: "GET",
      url: "/admin/traces/tr_shared",
      headers: {
        "x-admin-token": "secret-metrics-token"
      }
    });
    expect(allowed.statusCode).toBe(404);
  });
});
