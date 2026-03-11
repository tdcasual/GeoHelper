import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { createMemoryCompileEventSink } from "../src/services/compile-events";

describe("GET /admin/compile-events", () => {
  it("returns recent compile events in reverse chronological order", async () => {
    const compileEventSink = createMemoryCompileEventSink();
    const app = buildServer(
      {},
      {
        compileEventSink,
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

    await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      payload: { message: "画一个圆", mode: "byok" }
    });

    await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      payload: { message: "再画一个圆", mode: "byok" }
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin/compile-events?limit=20"
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      events: [
        expect.objectContaining({
          requestId: "req-2",
          traceId: "tr_req-2",
          event: "compile_success",
          finalStatus: "success",
          mode: "byok"
        }),
        expect.objectContaining({
          requestId: "req-1",
          traceId: "tr_req-1",
          event: "compile_success",
          finalStatus: "success",
          mode: "byok"
        })
      ]
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
      url: "/admin/compile-events"
    });
    expect(forbidden.statusCode).toBe(403);

    const allowed = await app.inject({
      method: "GET",
      url: "/admin/compile-events",
      headers: {
        "x-admin-token": "secret-metrics-token"
      }
    });
    expect(allowed.statusCode).toBe(200);
  });
});
