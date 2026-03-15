import { describe, expect, it } from "vitest";

import { readVendorConfig } from "../../scripts/geogebra/lib/read-vendor-config.mjs";

describe("readVendorConfig", () => {
  it("loads required latest and fallback settings", async () => {
    const config = await readVendorConfig();

    expect(config.latestBundleUrl).toBe(
      "https://download.geogebra.org/package/geogebra-math-apps-bundle"
    );
    expect(config.fallbackVersion).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(config.fallbackBundleUrl).toContain(
      config.fallbackVersion.replace(/\./g, "-")
    );
    expect(config.allowCachedLastKnownGood).toBe(true);
  });
});
