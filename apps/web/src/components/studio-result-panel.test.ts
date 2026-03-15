import { describe, expect, it } from "vitest";

import type { ChatMessage } from "../state/chat-store";
import { toStudioResultViewModel } from "./studio-result-panel";

describe("studio-result-panel", () => {
  it("maps assistant output and agent steps into a structured studio result", () => {
    const message: ChatMessage = {
      id: "msg_assistant_1",
      role: "assistant",
      content: "已创建三角形 ABC。\n待确认：点 D 在线段 BC 上。",
      agentSteps: [
        { name: "intent", status: "ok", duration_ms: 5 },
        { name: "planner", status: "ok", duration_ms: 8 }
      ]
    };

    const viewModel = toStudioResultViewModel(message);

    expect(viewModel.summary.items[0]).toContain("已创建三角形 ABC");
    expect(viewModel.executionSteps).toHaveLength(2);
    expect(viewModel.executionSteps[0].label).toBe("intent");
    expect(viewModel.uncertainties).toContain("点 D 在线段 BC 上。");
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
      content: "已生成一条垂直平分线。"
    };

    const viewModel = toStudioResultViewModel(message);

    expect(viewModel.summary.items).toEqual(["已生成一条垂直平分线。"]);
    expect(viewModel.executionSteps).toEqual([]);
    expect(viewModel.uncertainties).toEqual([]);
  });

  it("returns an empty placeholder when no assistant message is available", () => {
    const viewModel = toStudioResultViewModel(null);

    expect(viewModel.summary.items).toEqual(["暂无生成结果"]);
    expect(viewModel.executionSteps).toEqual([]);
    expect(viewModel.nextActions).toHaveLength(3);
    expect(viewModel.nextActions.every((item) => item.disabled)).toBe(true);
  });
});
