import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { createMemoryMetricsStore } from "../src/services/metrics-store";
import { clearRateLimits } from "../src/services/rate-limit";

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
});
