import { describe, expect, it } from "vitest";
import { toAppletPixelSize } from "./applet-size";

describe("toAppletPixelSize", () => {
  it("rounds host measurements down to safe integer applet dimensions", () => {
    expect(toAppletPixelSize({ width: 702.8, height: 1109.4 })).toEqual({
      width: 702,
      height: 1109
    });
  });

  it("rejects unusable host dimensions", () => {
    expect(() => toAppletPixelSize({ width: 0, height: 10 })).toThrow(
      /host size/
    );
  });
});
