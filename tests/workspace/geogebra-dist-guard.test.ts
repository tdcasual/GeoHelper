import { describe, expect, it } from "vitest";
import { findExternalGeoGebraRefs } from "../../scripts/geogebra/assert-no-external.mjs";

describe("findExternalGeoGebraRefs", () => {
  it("reports geogebra.org references in emitted files", () => {
    const refs = findExternalGeoGebraRefs([
      {
        path: "dist/assets/app.js",
        content: "https://www.geogebra.org/apps/deployggb.js"
      }
    ]);

    expect(refs).toHaveLength(1);
    expect(refs[0].path).toBe("dist/assets/app.js");
  });
});
