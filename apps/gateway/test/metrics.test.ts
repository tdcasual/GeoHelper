import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { createMemoryMetricsStore } from "../src/services/metrics-store";
import { createMemoryRateLimitStore } from "../src/services/rate-limit-store";
import {
  createGeometryAgentResponder,
  createGeometryDraftFixture,
  createGeometryReviewFixture
} from "./helpers/geometry-agent-stub";

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
        requestCommandBatch: createGeometryAgentResponder()
      }
    );

    await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: { message: "画一个圆", mode: "byok" }
    });

    await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
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

  it("ignores the legacy performance sampling header on v2", async () => {
    const metricsStore = createMemoryMetricsStore();

    const app = buildServer(
      {},
      {
        metricsStore,
        requestCommandBatch: createGeometryAgentResponder()
      }
    );

    await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
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
    expect(payload.compile.total_requests).toBe(1);
    expect(payload.compile.success).toBe(1);
    expect(payload.compile.perf_sample_count).toBe(0);
  });

  it("keeps fallback count at zero for reviewer-based workflow runs", async () => {
    const metricsStore = createMemoryMetricsStore();

    const app = buildServer(
      {},
      {
        metricsStore,
        requestCommandBatch: createGeometryAgentResponder({
          drafts: [
            createGeometryDraftFixture({
              commandBatchDraft: {
                version: "1.0",
                scene_id: "scene_retry_1",
                transaction_id: "tx_retry_1",
                commands: [],
                post_checks: [],
                explanations: []
              }
            }),
            createGeometryDraftFixture({
              commandBatchDraft: {
                version: "1.0",
                scene_id: "scene_retry_2",
                transaction_id: "tx_retry_2",
                commands: [],
                post_checks: [],
                explanations: []
              }
            })
          ],
          reviews: [
            createGeometryReviewFixture({
              verdict: "revise",
              repairInstructions: ["补充一步说明"]
            }),
            createGeometryReviewFixture()
          ]
        })
      }
    );

    await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: { message: "画一个圆", mode: "byok" }
    });

    const metrics = await app.inject({
      method: "GET",
      url: "/admin/metrics"
    });

    expect(metrics.statusCode).toBe(200);
    const payload = JSON.parse(metrics.payload);
    expect(payload.compile.average_retry_count).toBe(1);
    expect(payload.compile.fallback_count).toBe(0);
    expect(payload.compile.fallback_rate).toBe(0);
  });

  it("tracks cost_per_request using configured unit cost", async () => {
    const metricsStore = createMemoryMetricsStore();

    const app = buildServer(
      {
        COST_PER_REQUEST_USD: "0.02"
      },
      {
        metricsStore,
        requestCommandBatch: createGeometryAgentResponder()
      }
    );

    await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: { message: "画一个圆", mode: "byok" }
    });

    const metrics = await app.inject({
      method: "GET",
      url: "/admin/metrics"
    });

    expect(metrics.statusCode).toBe(200);
    const payload = JSON.parse(metrics.payload);
    expect(payload.compile.total_cost_usd).toBeCloseTo(0.04, 4);
    expect(payload.compile.cost_per_request_usd).toBeCloseTo(0.04, 4);
  });
});
