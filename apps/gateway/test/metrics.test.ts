import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { createMemoryMetricsStore } from "../src/services/metrics-store";
import { createMemoryRateLimitStore } from "../src/services/rate-limit-store";

describe("GET /admin/metrics", () => {
  it("reports compile success rate and rate-limited ratio", async () => {
    const rateLimitStore = createMemoryRateLimitStore();
    const metricsStore = createMemoryMetricsStore();

    const app = buildServer(
      {
        RATE_LIMIT_MAX: "1",
        RATE_LIMIT_WINDOW_MS: "60000"
      },
      {
        rateLimitStore,
        metricsStore,
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
    expect(payload.compile.p95_latency_ms).toBeGreaterThanOrEqual(0);
    expect(payload.compile.fallback_rate).toBeGreaterThanOrEqual(0);
    expect(payload.compile.cost_per_request_usd).toBeGreaterThanOrEqual(0);
  });

  it("requires admin token when configured", async () => {
    const metricsStore = createMemoryMetricsStore();

    const app = buildServer(
      {
        ADMIN_METRICS_TOKEN: "secret-metrics-token"
      },
      {
        metricsStore
      }
    );

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

  it("records sampled performance stats", async () => {
    const metricsStore = createMemoryMetricsStore();

    const app = buildServer(
      {},
      {
        metricsStore,
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
      headers: {
        "x-client-performance-sampling": "1"
      },
      payload: { message: "画一个圆", mode: "byok" }
    });

    const metrics = await app.inject({
      method: "GET",
      url: "/admin/metrics"
    });

    expect(metrics.statusCode).toBe(200);
    const payload = JSON.parse(metrics.payload);
    expect(payload.compile.perf_sample_count).toBe(1);
    expect(payload.compile.perf_total_ms_avg).toBeGreaterThanOrEqual(0);
    expect(payload.compile.perf_upstream_ms_avg).toBeGreaterThanOrEqual(0);
  });

  it("tracks fallback count and fallback rate", async () => {
    const metricsStore = createMemoryMetricsStore();

    const app = buildServer(
      {},
      {
        metricsStore,
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

    await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      payload: { message: "画一个圆", mode: "byok" }
    });

    const metrics = await app.inject({
      method: "GET",
      url: "/admin/metrics"
    });

    expect(metrics.statusCode).toBe(200);
    const payload = JSON.parse(metrics.payload);
    expect(payload.compile.fallback_count).toBe(1);
    expect(payload.compile.fallback_rate).toBe(1);
  });

  it("tracks cost_per_request using configured unit cost", async () => {
    const metricsStore = createMemoryMetricsStore();

    const app = buildServer(
      {
        COST_PER_REQUEST_USD: "0.02"
      },
      {
        metricsStore,
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

    const metrics = await app.inject({
      method: "GET",
      url: "/admin/metrics"
    });

    expect(metrics.statusCode).toBe(200);
    const payload = JSON.parse(metrics.payload);
    expect(payload.compile.total_cost_usd).toBeCloseTo(0.06, 4);
    expect(payload.compile.cost_per_request_usd).toBeCloseTo(0.06, 4);
  });
});
