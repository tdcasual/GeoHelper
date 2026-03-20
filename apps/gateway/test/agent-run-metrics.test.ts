import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { createMemoryMetricsStore } from "../src/services/metrics-store";
import { clearRateLimits } from "../src/services/rate-limit";
import {
  createGeometryAgentResponder,
  createGeometryDraftFixture,
  createGeometryReviewFixture
} from "./helpers/geometry-agent-stub";

describe("agent run metrics", () => {
  it("reports aggregate agent run quality stats", async () => {
    clearRateLimits();

    const metricsStore = createMemoryMetricsStore();
    const app = buildServer(
      {},
      {
        metricsStore,
        requestCommandBatch: async (input) => {
          if (input.systemPrompt?.includes("GeometryDraftPackage")) {
            return {
              normalizedIntent: "构造中点",
              assumptions: [],
              constructionPlan: ["先取线段 AB", "再取中点 M"],
              namingPlan: ["A", "B", "M"],
              commandBatchDraft: {
                version: "1.0",
                scene_id: "scene_1",
                transaction_id: "tx_1",
                commands: [],
                explanations: ["草案"],
                post_checks: []
              },
              teachingOutline: ["说明中点定义"],
              reviewChecklist: ["检查 M 是否在线段 AB 上"]
            };
          }

          return {
            reviewer: "geometry-reviewer",
            verdict: "approve",
            summary: ["草案可执行"],
            correctnessIssues: [],
            ambiguityIssues: [],
            namingIssues: [],
            teachingIssues: [],
            repairInstructions: [],
            uncertaintyItems: []
          };
        }
      }
    );

    await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: {
        message: "作线段 AB 的中点 M",
        mode: "byok"
      }
    });

    const metrics = await app.inject({
      method: "GET",
      url: "/admin/metrics"
    });

    expect(metrics.statusCode).toBe(200);
    expect(JSON.parse(metrics.payload)).toMatchObject({
      agent_runs: {
        total_runs: 1,
        success: 1,
        degraded: 0,
        average_iteration_count: 1
      }
    });
  });

  it("advances compile totals after a successful agent run", async () => {
    clearRateLimits();

    const metricsStore = createMemoryMetricsStore();
    const app = buildServer(
      {},
      {
        metricsStore,
        requestCommandBatch: async (input) => {
          if (input.systemPrompt?.includes("GeometryDraftPackage")) {
            return {
              normalizedIntent: "画圆",
              assumptions: [],
              constructionPlan: ["创建点 A", "以 A 为圆心作圆"],
              namingPlan: ["A"],
              commandBatchDraft: {
                version: "1.0",
                scene_id: "scene_1",
                transaction_id: "tx_1",
                commands: [
                  {
                    id: "cmd_point_a",
                    op: "create_point",
                    args: {
                      name: "A",
                      x: 0,
                      y: 0
                    },
                    depends_on: [],
                    idempotency_key: "point_a"
                  },
                  {
                    id: "cmd_circle_a",
                    op: "create_conic",
                    args: {
                      center: "A",
                      radius: 3
                    },
                    depends_on: ["cmd_point_a"],
                    idempotency_key: "circle_a"
                  }
                ],
                explanations: ["先创建点 A", "再画半径为 3 的圆"],
                post_checks: []
              },
              teachingOutline: ["讲解圆心", "讲解半径"],
              reviewChecklist: ["半径是否明确"]
            };
          }

          return {
            reviewer: "geometry-reviewer",
            verdict: "approve",
            summary: ["草案可执行"],
            correctnessIssues: [],
            ambiguityIssues: [],
            namingIssues: [],
            teachingIssues: [],
            repairInstructions: [],
            uncertaintyItems: []
          };
        }
      }
    );

    const runRes = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: {
        message: "过点 A 作一个半径为 3 的圆",
        mode: "byok"
      }
    });

    expect(runRes.statusCode).toBe(200);

    const metrics = await app.inject({
      method: "GET",
      url: "/admin/metrics"
    });

    expect(metrics.statusCode).toBe(200);
    expect(JSON.parse(metrics.payload)).toMatchObject({
      compile: {
        total_requests: 1,
        success: 1,
        failed: 0,
        fallback_count: 0
      },
      agent_runs: {
        total_runs: 1,
        success: 1
      }
    });
  });

  it("counts invalid command batches as compile failures while preserving agent run visibility", async () => {
    clearRateLimits();

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
                scene_id: "scene_invalid",
                transaction_id: "tx_invalid",
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
                explanations: ["初稿包含无效命令"],
                post_checks: []
              }
            })
          ],
          reviews: [createGeometryReviewFixture()]
        })
      }
    );

    const runRes = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: {
        message: "过点 A 作一个半径为 3 的圆",
        mode: "byok"
      }
    });

    expect(runRes.statusCode).toBe(200);
    expect(JSON.parse(runRes.payload)).toMatchObject({
      agent_run: {
        run: {
          status: "needs_review"
        },
        evidence: {
          preflight: {
            status: "failed"
          }
        }
      }
    });

    const metrics = await app.inject({
      method: "GET",
      url: "/admin/metrics"
    });

    expect(metrics.statusCode).toBe(200);
    expect(JSON.parse(metrics.payload)).toMatchObject({
      compile: {
        total_requests: 1,
        success: 0,
        failed: 1,
        fallback_count: 0
      },
      agent_runs: {
        total_runs: 1,
        needs_review: 1
      }
    });
  });

  it("tracks cost_per_request using configured unit cost for agent runs", async () => {
    clearRateLimits();

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

    const runRes = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: {
        message: "过点 A 作一个半径为 3 的圆",
        mode: "byok"
      }
    });

    expect(runRes.statusCode).toBe(200);

    const metrics = await app.inject({
      method: "GET",
      url: "/admin/metrics"
    });

    expect(metrics.statusCode).toBe(200);
    expect(JSON.parse(metrics.payload)).toMatchObject({
      compile: {
        total_cost_usd: 0.04,
        cost_per_request_usd: 0.04
      }
    });
  });

  it("does not count degraded agent runs as compile fallbacks", async () => {
    clearRateLimits();

    const metricsStore = createMemoryMetricsStore();
    const app = buildServer(
      {},
      {
        metricsStore,
        requestCommandBatch: createGeometryAgentResponder({
          reviews: [
            createGeometryReviewFixture({
              verdict: "revise",
              summary: ["需要继续修正"],
              repairInstructions: ["请再次尝试修复"]
            }),
            createGeometryReviewFixture({
              verdict: "revise",
              summary: ["仍有问题"],
              repairInstructions: ["保留待人工复核"]
            })
          ]
        })
      }
    );

    const runRes = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: {
        message: "作线段 AB 的中点 M",
        mode: "byok"
      }
    });

    expect(runRes.statusCode).toBe(200);

    const metrics = await app.inject({
      method: "GET",
      url: "/admin/metrics"
    });

    expect(metrics.statusCode).toBe(200);
    expect(JSON.parse(metrics.payload)).toMatchObject({
      compile: {
        total_requests: 1,
        success: 1,
        failed: 0,
        fallback_count: 0
      },
      agent_runs: {
        total_runs: 1,
        degraded: 1
      }
    });
  });
});
