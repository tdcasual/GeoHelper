import { describe, expect, it, vi } from "vitest";

import { createGeometryAuthor } from "../src/services/geometry-author";
import { createGeometryReviewer } from "../src/services/geometry-reviewer";
import { createGeometryReviser } from "../src/services/geometry-reviser";

describe("geometry author services", () => {
  it("maps llm JSON into a GeometryDraftPackage", async () => {
    const request = vi.fn().mockResolvedValue({
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
    });

    const author = createGeometryAuthor(request);
    const draft = await author({
      message: "作线段 AB 的中点 M",
      mode: "byok"
    });

    expect(draft.namingPlan).toContain("M");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("maps llm JSON into a GeometryReviewReport", async () => {
    const request = vi.fn().mockResolvedValue({
      reviewer: "geometry-reviewer",
      verdict: "revise",
      summary: ["缺少辅助说明"],
      correctnessIssues: [],
      ambiguityIssues: [],
      namingIssues: ["点 M 的命名说明不够明确"],
      teachingIssues: ["需要补充课堂讲解顺序"],
      repairInstructions: ["补充对中点定义的说明"],
      uncertaintyItems: [
        {
          id: "unc_midpoint",
          label: "M 是否在线段 AB 上",
          followUpPrompt: "请确认 M 在线段 AB 上且 AM = MB。",
          reviewStatus: "pending"
        }
      ]
    });

    const reviewer = createGeometryReviewer(request);
    const review = await reviewer({
      draft: {
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
      },
      compileInput: {
        message: "作线段 AB 的中点 M",
        mode: "byok"
      }
    });

    expect(review.verdict).toBe("revise");
    expect(review.uncertaintyItems[0]?.id).toBe("unc_midpoint");
  });

  it("maps llm JSON into a revised GeometryDraftPackage", async () => {
    const request = vi.fn().mockResolvedValue({
      normalizedIntent: "构造中点",
      assumptions: [],
      constructionPlan: ["先取线段 AB", "标注中点 M"],
      namingPlan: ["A", "B", "M"],
      commandBatchDraft: {
        version: "1.0",
        scene_id: "scene_1",
        transaction_id: "tx_2",
        commands: [],
        explanations: ["已修正草案"],
        post_checks: []
      },
      teachingOutline: ["先定义中点", "再解释 AM = MB"],
      reviewChecklist: ["检查 M 是否在线段 AB 上"]
    });

    const reviser = createGeometryReviser(request);
    const revised = await reviser({
      draft: {
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
      },
      reviewReport: {
        reviewer: "geometry-reviewer",
        verdict: "revise",
        summary: ["需要补充说明"],
        correctnessIssues: [],
        ambiguityIssues: [],
        namingIssues: [],
        teachingIssues: ["需要强调 AM = MB"],
        repairInstructions: ["补充 AM = MB 的说明"],
        uncertaintyItems: []
      },
      compileInput: {
        message: "作线段 AB 的中点 M",
        mode: "byok"
      }
    });

    expect(revised.commandBatchDraft.transaction_id).toBe("tx_2");
    expect(revised.teachingOutline).toContain("再解释 AM = MB");
  });
});
