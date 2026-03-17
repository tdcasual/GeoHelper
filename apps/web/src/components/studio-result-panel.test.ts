import { describe, expect, it } from "vitest";

import type { ChatMessage } from "../state/chat-store";
import { toStudioResultViewModel } from "./studio-result-panel";

describe("studio-result-panel", () => {
  it("maps structured assistant results and agent steps into a review-oriented view model", () => {
    const message: ChatMessage = {
      id: "msg_assistant_1",
      role: "assistant",
      content: "已创建三角形 ABC。",
      result: {
        status: "success",
        commandCount: 2,
        summaryItems: ["已创建三角形 ABC", "已作角平分线 AD"],
        explanationLines: ["已创建三角形 ABC", "已作角平分线 AD"],
        warningItems: ["注意：请检查角平分线位置"],
        uncertaintyItems: [
          {
            id: "unc_d",
            label: "点 D 在线段 BC 上",
            reviewStatus: "pending",
            followUpPrompt: "请确认点 D 是否在线段 BC 上。"
          },
          {
            id: "unc_angle",
            label: "AD 是否平分角 A",
            reviewStatus: "confirmed",
            followUpPrompt: "请确认 AD 是否平分角 A。"
          }
        ],
        canvasLinks: []
      },
      agentSteps: [
        { name: "intent", status: "ok", duration_ms: 5 },
        { name: "planner", status: "ok", duration_ms: 8 }
      ]
    };

    const viewModel = toStudioResultViewModel(message);

    expect(viewModel.status).toBe("success");
    expect(viewModel.summary.items).toEqual(["已创建三角形 ABC", "已作角平分线 AD"]);
    expect(viewModel.warningItems).toEqual(["注意：请检查角平分线位置"]);
    expect(viewModel.executionSteps).toHaveLength(2);
    expect(viewModel.executionSteps[0].label).toBe("intent");
    expect(viewModel.uncertainties[0]?.label).toBe("点 D 在线段 BC 上");
    expect(viewModel.reviewSummary).toEqual({
      pendingCount: 1,
      confirmedCount: 1,
      needsFixCount: 0
    });
    expect(viewModel.nextActions.map((item) => item.id)).toEqual([
      "add_auxiliary",
      "generate_explanation",
      "attempt_proof"
    ]);
    expect(viewModel.nextActions.every((item) => item.disabled === false)).toBe(true);
  });

  it("falls back to plain summary when no agent steps exist", () => {
    const message: ChatMessage = {
      id: "msg_assistant_2",
      role: "assistant",
      content: "已生成一条垂直平分线。",
      result: {
        status: "success",
        commandCount: 1,
        summaryItems: ["已生成一条垂直平分线。"],
        explanationLines: [],
        warningItems: [],
        uncertaintyItems: [],
        canvasLinks: []
      }
    };

    const viewModel = toStudioResultViewModel(message);

    expect(viewModel.status).toBe("success");
    expect(viewModel.summary.items).toEqual(["已生成一条垂直平分线。"]);
    expect(viewModel.executionSteps).toEqual([]);
    expect(viewModel.warningItems).toEqual([]);
    expect(viewModel.uncertainties).toEqual([]);
    expect(viewModel.reviewSummary).toEqual({
      pendingCount: 0,
      confirmedCount: 0,
      needsFixCount: 0
    });
  });

  it("returns an empty placeholder when no assistant message is available", () => {
    const viewModel = toStudioResultViewModel(null);

    expect(viewModel.status).toBe("idle");
    expect(viewModel.summary.items).toEqual(["暂无生成结果"]);
    expect(viewModel.executionSteps).toEqual([]);
    expect(viewModel.reviewSummary).toEqual({
      pendingCount: 0,
      confirmedCount: 0,
      needsFixCount: 0
    });
    expect(viewModel.nextActions).toHaveLength(3);
    expect(viewModel.nextActions.every((item) => item.disabled)).toBe(true);
  });

  it("surfaces error state from structured results", () => {
    const viewModel = toStudioResultViewModel({
      id: "msg_error",
      role: "assistant",
      content: "生成失败，请重试",
      result: {
        status: "error",
        commandCount: 0,
        summaryItems: ["生成失败，请重试"],
        explanationLines: [],
        warningItems: [],
        uncertaintyItems: [],
        canvasLinks: []
      }
    });

    expect(viewModel.status).toBe("error");
    expect(viewModel.reviewSummary).toEqual({
      pendingCount: 0,
      confirmedCount: 0,
      needsFixCount: 0
    });
    expect(viewModel.nextActions.every((item) => item.disabled)).toBe(true);
  });
});
