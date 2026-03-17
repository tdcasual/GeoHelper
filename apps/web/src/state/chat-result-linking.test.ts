import { describe, expect, it } from "vitest";

import {
  buildStudioCanvasLinks,
  extractObjectLabelsFromText
} from "./chat-result-linking";

describe("chat-result-linking", () => {
  it("extracts object labels from common teacher-studio result phrases", () => {
    expect(extractObjectLabelsFromText("已创建三角形 ABC")).toEqual([
      "A",
      "B",
      "C"
    ]);
    expect(extractObjectLabelsFromText("点 D 在线段 BC 上")).toEqual([
      "D",
      "B",
      "C"
    ]);
    expect(extractObjectLabelsFromText("已作角平分线 AD")).toEqual([
      "A",
      "D"
    ]);
    expect(extractObjectLabelsFromText("以圆 O 为圆心作圆")).toEqual(["O"]);
    expect(extractObjectLabelsFromText("作直线 l")).toEqual(["l"]);
  });

  it("builds canvas links for summary, warning, and uncertainty items", () => {
    const links = buildStudioCanvasLinks({
      summaryItems: ["已创建三角形 ABC", "已作角平分线 AD"],
      warningItems: ["注意：请检查顶点 A 位置"],
      uncertaintyItems: [
        {
          id: "unc_d",
          label: "点 D 在线段 BC 上",
          reviewStatus: "pending",
          followUpPrompt: "请确认点 D 是否在线段 BC 上。"
        }
      ]
    });

    expect(links).toEqual(
      expect.arrayContaining([
        {
          id: "summary_1",
          scope: "summary",
          text: "已创建三角形 ABC",
          objectLabels: ["A", "B", "C"]
        },
        {
          id: "summary_2",
          scope: "summary",
          text: "已作角平分线 AD",
          objectLabels: ["A", "D"]
        },
        {
          id: "uncertainty_unc_d",
          scope: "uncertainty",
          text: "点 D 在线段 BC 上",
          objectLabels: ["D", "B", "C"],
          uncertaintyId: "unc_d"
        }
      ])
    );
  });
});
