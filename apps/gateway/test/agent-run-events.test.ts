import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { createMemoryCompileEventSink } from "../src/services/compile-events";
import { clearRateLimits } from "../src/services/rate-limit";

describe("agent run events", () => {
  it("records agent run metadata on success", async () => {
    clearRateLimits();

    const compileEventSink = createMemoryCompileEventSink();
    const app = buildServer(
      {},
      {
        compileEventSink,
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

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: {
        message: "作线段 AB 的中点 M",
        mode: "byok"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(compileEventSink.readAll()).toEqual([
      expect.objectContaining({
        event: "compile_success",
        finalStatus: "success",
        path: "/api/v2/agent/runs",
        metadata: expect.objectContaining({
          iterationCount: 1,
          reviewerVerdict: "approve",
          degraded: false
        })
      })
    ]);
  });
});
