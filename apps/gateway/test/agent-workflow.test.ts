import { describe, expect, it, vi } from "vitest";

import { createAgentWorkflow } from "../src/services/agent-workflow";

describe("createAgentWorkflow", () => {
  it("returns success without revision when reviewer approves", async () => {
    const workflow = createAgentWorkflow({
      author: vi.fn().mockResolvedValue({
        normalizedIntent: "构造角平分线",
        assumptions: [],
        constructionPlan: ["构造角", "构造平分线"],
        namingPlan: ["A", "B", "C", "D"],
        commandBatchDraft: {
          version: "1.0",
          scene_id: "scene_1",
          transaction_id: "tx_1",
          commands: [],
          explanations: ["草案"],
          post_checks: []
        },
        teachingOutline: ["先画角", "再说明角平分线"],
        reviewChecklist: ["检查平分线经过顶点"]
      }),
      reviewer: vi.fn().mockResolvedValue({
        reviewer: "geometry-reviewer",
        verdict: "approve",
        summary: [],
        correctnessIssues: [],
        ambiguityIssues: [],
        namingIssues: [],
        teachingIssues: [],
        repairInstructions: [],
        uncertaintyItems: []
      }),
      reviser: vi.fn(),
      preflight: vi.fn().mockResolvedValue({
        status: "passed",
        issues: [],
        referencedLabels: ["A", "B", "C", "D"],
        generatedLabels: ["A", "B", "C", "D"],
        dependencySummary: {
          commandCount: 0,
          edgeCount: 0
        }
      })
    });

    const result = await workflow({
      message: "作角平分线",
      mode: "byok"
    });

    expect(result.run.status).toBe("success");
    expect(result.run.iterationCount).toBe(1);
    expect(result.reviews).toHaveLength(1);
  });
});
