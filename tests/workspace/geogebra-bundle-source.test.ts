import { describe, expect, it } from "vitest";
import { parseBundleSource } from "../../scripts/geogebra/lib/resolve-bundle-source.mjs";

describe("parseBundleSource", () => {
  it("extracts a dotted version from the redirected zip url", () => {
    const source = parseBundleSource(
      "https://download.geogebra.org/installers/5.4/geogebra-math-apps-bundle-5-4-918-0.zip"
    );

    expect(source.version).toBe("5.4.918.0");
    expect(source.filename).toBe("geogebra-math-apps-bundle-5-4-918-0.zip");
  });

  it("throws on an unexpected zip filename", () => {
    expect(() => parseBundleSource("https://example.com/not-a-geogebra.zip")).toThrow(
      /bundle version/
    );
  });
});
