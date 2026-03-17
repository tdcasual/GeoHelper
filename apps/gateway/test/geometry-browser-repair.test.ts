import { describe, expect, it, vi } from "vitest";

import { createGeometryBrowserRepair } from "../src/services/geometry-browser-repair";

describe("geometry browser repair service", () => {
  it("includes teacher instruction and canvas evidence in the repair prompt", async () => {
    const request = vi.fn().mockResolvedValue({
      normalizedIntent: "修正角平分线",
      assumptions: [],
      constructionPlan: ["重新检查点 D", "补画角平分线"],
      namingPlan: ["A", "B", "C", "D"],
      commandBatchDraft: {
        version: "1.0",
        scene_id: "scene_1",
        transaction_id: "tx_2",
        commands: [],
        explanations: ["已修正草案"],
        post_checks: []
      },
      teachingOutline: ["说明修正后的作图依据"],
      reviewChecklist: ["检查点 D 是否位于 BC 上"]
    });

    const repair = createGeometryBrowserRepair(request);
    const draft = await repair({
      sourceRun: {
        run: {
          id: "run_1",
          target: "gateway",
          mode: "byok",
          status: "success",
          iterationCount: 1,
          startedAt: "2026-03-17T10:00:00.000Z",
          finishedAt: "2026-03-17T10:00:01.000Z",
          totalDurationMs: 1000
        },
        draft: {
          normalizedIntent: "构造角平分线",
          assumptions: [],
          constructionPlan: ["先作三角形", "再作角平分线"],
          namingPlan: ["A", "B", "C", "D"],
          commandBatchDraft: {
            version: "1.0",
            scene_id: "scene_1",
            transaction_id: "tx_1",
            commands: [],
            explanations: ["原始草案"],
            post_checks: []
          },
          teachingOutline: ["说明角平分线定义"],
          reviewChecklist: ["检查点 D 是否在 BC 上"]
        },
        reviews: [],
        evidence: {
          preflight: {
            status: "passed",
            issues: [],
            referencedLabels: ["A", "B", "C", "D"],
            generatedLabels: ["A", "B", "C", "D"]
          },
          canvas: {
            executedCommandCount: 2,
            failedCommandIds: [],
            createdLabels: ["A", "B", "C", "D"],
            visibleLabels: ["A", "B", "C", "D"],
            teacherFocus: "点 D 在线段 BC 上"
          }
        },
        teacherPacket: {
          summary: ["已创建三角形 ABC"],
          warnings: [],
          uncertainties: [],
          nextActions: ["修正点 D"],
          canvasLinks: []
        },
        telemetry: {
          upstreamCallCount: 2,
          degraded: false,
          retryCount: 0,
          stages: []
        }
      },
      teacherInstruction: "只修正点 D 在线段 BC 上这一项",
      canvasEvidence: {
        executedCommandCount: 2,
        failedCommandIds: [],
        createdLabels: ["A", "B", "C", "D"],
        visibleLabels: ["D", "B", "C"],
        teacherFocus: "点 D 在线段 BC 上"
      },
      compileInput: {
        message: "请修正点 D 的位置",
        mode: "byok"
      }
    });

    expect(draft.commandBatchDraft.transaction_id).toBe("tx_2");
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("只修正点 D 在线段 BC 上这一项")
      })
    );
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("visibleLabels")
      })
    );
  });
});
