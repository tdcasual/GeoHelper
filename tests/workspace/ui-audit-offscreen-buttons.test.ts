import { describe, expect, it } from "vitest";
import { filterViewportButtonViolations } from "../../scripts/ui/lib/offscreen-buttons.mjs";

describe("filterViewportButtonViolations", () => {
  it("keeps true viewport overflows", () => {
    const violations = filterViewportButtonViolations(
      [
        {
          label: "bad-button",
          left: 10,
          right: 120,
          top: 860,
          bottom: 900,
          clippingAncestors: []
        }
      ],
      { width: 390, height: 844 }
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.label).toBe("bad-button");
  });

  it("ignores buttons below fold inside a vertical scroll container that stays in viewport", () => {
    const violations = filterViewportButtonViolations(
      [
        {
          label: "history-item",
          left: 28,
          right: 362,
          top: 850.94,
          bottom: 916.13,
          clippingAncestors: [
            {
              left: 20,
              right: 370,
              top: 432,
              bottom: 834,
              scrollHeight: 1200,
              clientHeight: 402,
              scrollWidth: 350,
              clientWidth: 350,
              overflowX: "hidden",
              overflowY: "auto"
            }
          ]
        }
      ],
      { width: 390, height: 844 }
    );

    expect(violations).toHaveLength(0);
  });

  it("ignores buttons below fold inside settings content scroll area", () => {
    const violations = filterViewportButtonViolations(
      [
        {
          label: "保存官方预设",
          left: 34,
          right: 135.98,
          top: 895,
          bottom: 928,
          clippingAncestors: [
            {
              left: 23,
              right: 364,
              top: 155,
              bottom: 820,
              scrollHeight: 900,
              clientHeight: 665,
              scrollWidth: 339,
              clientWidth: 339,
              overflowX: "auto",
              overflowY: "auto"
            }
          ]
        }
      ],
      { width: 390, height: 844 }
    );

    expect(violations).toHaveLength(0);
  });

  it("does not ignore overflow when clipping ancestor itself extends offscreen", () => {
    const violations = filterViewportButtonViolations(
      [
        {
          label: "still-bad",
          left: 10,
          right: 120,
          top: 860,
          bottom: 900,
          clippingAncestors: [
            {
              left: 0,
              right: 390,
              top: 700,
              bottom: 900,
              scrollHeight: 1200,
              clientHeight: 200,
              scrollWidth: 390,
              clientWidth: 390,
              overflowX: "hidden",
              overflowY: "auto"
            }
          ]
        }
      ],
      { width: 390, height: 844 }
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.label).toBe("still-bad");
  });
});
