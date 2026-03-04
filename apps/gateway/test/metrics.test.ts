import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { clearRateLimits } from "../src/services/rate-limit";
import { resetGatewayMetrics } from "../src/services/metrics";

describe("GET /admin/metrics", () => {
  it("reports compile success rate and rate-limited ratio", async () => {
    clearRateLimits();
    resetGatewayMetrics();

    const app = buildServer(
      {
        RATE_LIMIT_MAX: "1",
        RATE_LIMIT_WINDOW_MS: "60000"
      },
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

    const metrics = await app.inject({
      method: "GET",
      url: "/admin/metrics"
    });

    expect(metrics.statusCode).toBe(200);
    const payload = JSON.parse(metrics.payload);
    expect(payload.compile.total_requests).toBe(2);
    expect(payload.compile.success).toBe(1);
    expect(payload.compile.rate_limited).toBe(1);
    expect(payload.compile.success_rate).toBe(0.5);
    expect(payload.compile.rate_limited_ratio).toBe(0.5);
  });

  it("requires admin token when configured", async () => {
    clearRateLimits();
    resetGatewayMetrics();

    const app = buildServer({
      ADMIN_METRICS_TOKEN: "secret-metrics-token"
    });

    const forbidden = await app.inject({
      method: "GET",
      url: "/admin/metrics"
    });
    expect(forbidden.statusCode).toBe(403);

    const allowed = await app.inject({
      method: "GET",
      url: "/admin/metrics",
      headers: {
        "x-admin-token": "secret-metrics-token"
      }
    });
    expect(allowed.statusCode).toBe(200);
  });
});
