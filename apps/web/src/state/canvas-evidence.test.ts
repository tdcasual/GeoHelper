import { describe, expect, it } from "vitest";

import { buildCanvasEvidence } from "./canvas-evidence";

describe("buildCanvasEvidence", () => {
  it("captures failed commands and visible labels from the executed scene", () => {
    const evidence = buildCanvasEvidence({
      executedCommandIds: ["c1", "c2"],
      failedCommandIds: ["c2"],
      visibleLabels: ["A", "B", "M"]
    });

    expect(evidence.executedCommandCount).toBe(2);
    expect(evidence.failedCommandIds).toEqual(["c2"]);
    expect(evidence.visibleLabels).toContain("M");
  });
});
