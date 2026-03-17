import { describe, expect, it } from "vitest";

import type { ChatMessage } from "../state/chat-store";
import {
  resolveProofAssistActions,
  resolveUncertaintyRepairPrompt
} from "./proof-assist-actions";

describe("proof-assist-actions", () => {
  it("builds enabled teacher follow-up actions from assistant result context", () => {
    const message: ChatMessage = {
      id: "msg_assistant_proof",
      role: "assistant",
      content: "已创建三角形 ABC。",
      result: {
        status: "success",
        commandCount: 2,
        summaryItems: ["已创建三角形 ABC", "已标出角平分线 AD"],
        explanationLines: ["已创建三角形 ABC", "已标出角平分线 AD"],
        warningItems: [],
        uncertaintyItems: [
          {
            id: "unc_d",
            label: "点 D 在线段 BC 上",
            reviewStatus: "pending",
            followUpPrompt: "请确认点 D 是否在线段 BC 上，并说明原因。"
          }
        ],
        canvasLinks: []
      }
    };

    const actions = resolveProofAssistActions(message);

    expect(actions.map((item) => item.id)).toEqual([
      "add_auxiliary",
      "generate_explanation",
      "attempt_proof"
    ]);
    expect(actions.every((item) => item.disabled === false)).toBe(true);
    expect(actions[0]?.prompt).toContain("已创建三角形 ABC");
    expect(actions[0]?.prompt).toContain("补充为了讲题更清晰的辅助线");
    expect(actions[0]?.prompt).toContain("点 D 在线段 BC 上");
    expect(actions[1]?.prompt).toContain("生成适合中学课堂讲解的解题思路");
    expect(actions[2]?.prompt).toContain("尝试给出证明思路或证明草稿");
  });

  it("returns disabled actions before any structured result exists", () => {
    const actions = resolveProofAssistActions(null);

    expect(actions).toHaveLength(3);
    expect(actions.every((item) => item.disabled)).toBe(true);
    expect(actions[0]?.reason).toContain("先生成图形");
  });

  it("keeps actions disabled when the latest result is an error", () => {
    const actions = resolveProofAssistActions({
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

    expect(actions.every((item) => item.disabled)).toBe(true);
  });

  it("builds a repair prompt for one specific uncertainty item", () => {
    const prompt = resolveUncertaintyRepairPrompt(
      {
        id: "msg_assistant_repair",
        role: "assistant",
        content: "已创建三角形 ABC。",
        result: {
          status: "success",
          commandCount: 2,
          summaryItems: ["已创建三角形 ABC", "已标出角平分线 AD"],
          explanationLines: ["已创建三角形 ABC", "已标出角平分线 AD"],
          warningItems: [],
          uncertaintyItems: [
            {
              id: "unc_d",
              label: "点 D 在线段 BC 上",
              reviewStatus: "pending",
              followUpPrompt: "请确认点 D 是否在线段 BC 上，并说明原因。"
            },
            {
              id: "unc_angle",
              label: "AD 是否平分角 A",
              reviewStatus: "pending",
              followUpPrompt: "请确认 AD 是否平分角 A。"
            }
          ],
          canvasLinks: []
        }
      },
      "unc_d"
    );

    expect(prompt).toContain("点 D 在线段 BC 上");
    expect(prompt).toContain("请确认点 D 是否在线段 BC 上，并说明原因。");
    expect(prompt).toContain("已创建三角形 ABC");
    expect(prompt).not.toContain("AD 是否平分角 A");
  });
});
