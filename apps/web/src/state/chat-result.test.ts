import { describe, expect, it } from "vitest";

import {
  buildUncertaintyFollowUpPrompt,
  normalizeChatStudioResult
} from "./chat-result";

describe("chat-result", () => {
  it("normalizes a structured studio result and repairs incomplete uncertainty fields", () => {
    const result = normalizeChatStudioResult({
      status: "success",
      commandCount: 2,
      summaryItems: ["已创建三角形 ABC", "", "已作角平分线 AD"],
      explanationLines: ["识别到等腰三角形结构", "  "],
      warningItems: ["待检查角平分线位置", ""],
      uncertaintyItems: [
        {
          label: "点 D 在线段 BC 上"
        },
        {
          id: "unc_manual",
          label: "AD 是否平分角 A",
          reviewStatus: "confirmed",
          followUpPrompt: "请确认 AD 是否平分角 A，并解释原因。"
        }
      ],
      canvasLinks: [
        {
          id: "link_summary_1",
          scope: "summary",
          text: "已创建三角形 ABC",
          objectLabels: ["A", "B", "C"]
        },
        {
          id: "",
          scope: "uncertainty",
          text: "点 D 在线段 BC 上",
          objectLabels: []
        }
      ]
    });

    expect(result).toMatchObject({
      status: "success",
      commandCount: 2,
      summaryItems: ["已创建三角形 ABC", "已作角平分线 AD"],
      explanationLines: ["识别到等腰三角形结构"],
      warningItems: ["待检查角平分线位置"],
      canvasLinks: [
        {
          id: "link_summary_1",
          scope: "summary",
          text: "已创建三角形 ABC",
          objectLabels: ["A", "B", "C"]
        }
      ]
    });
    expect(result?.uncertaintyItems).toHaveLength(2);
    expect(result?.uncertaintyItems[0]?.id).toContain("unc_");
    expect(result?.uncertaintyItems[0]?.reviewStatus).toBe("pending");
    expect(result?.uncertaintyItems[0]?.followUpPrompt).toContain(
      "点 D 在线段 BC 上"
    );
    expect(result?.uncertaintyItems[1]?.id).toBe("unc_manual");
    expect(result?.uncertaintyItems[1]?.reviewStatus).toBe("confirmed");
    expect(result?.canvasLinks).toHaveLength(1);
  });

  it("returns undefined for invalid result payloads", () => {
    expect(normalizeChatStudioResult(null)).toBeUndefined();
    expect(normalizeChatStudioResult({ status: "unknown" })).toBeUndefined();
    expect(normalizeChatStudioResult({ status: "success" })).toBeUndefined();
  });

  it("builds teacher-facing follow-up prompts for uncertainty review", () => {
    expect(buildUncertaintyFollowUpPrompt("点 D 在线段 BC 上")).toContain(
      "点 D 在线段 BC 上"
    );
    expect(buildUncertaintyFollowUpPrompt("点 D 在线段 BC 上")).toContain("明确");
  });
});
