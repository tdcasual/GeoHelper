import { describe, expect, it } from "vitest";

import type { ChatMessage } from "../state/chat-store";
import { resolveProofAssistActions } from "./proof-assist-actions";

describe("proof-assist-actions", () => {
  it("builds enabled teacher follow-up actions from assistant result context", () => {
    const message: ChatMessage = {
      id: "msg_assistant_proof",
      role: "assistant",
      content: "已创建三角形 ABC。\n已标出角平分线 AD。\n待确认：点 D 在线段 BC 上。"
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
    expect(actions[1]?.prompt).toContain("生成适合中学课堂讲解的解题思路");
    expect(actions[2]?.prompt).toContain("尝试给出证明思路或证明草稿");
  });

  it("returns disabled actions before any structured result exists", () => {
    const actions = resolveProofAssistActions(null);

    expect(actions).toHaveLength(3);
    expect(actions.every((item) => item.disabled)).toBe(true);
    expect(actions[0]?.reason).toContain("先生成图形");
  });
});
