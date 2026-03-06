import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("deploy docs", () => {
  it("documents geogebra self-hosted vendor sync before web build", () => {
    const txt = fs.readFileSync("docs/deploy/edgeone.md", "utf8");
    expect(txt).toContain("pnpm geogebra:sync");
    expect(txt).toContain("latest");
    expect(txt).toContain("fallback");
    expect(txt).toContain("vendor/geogebra/manifest.json");
  });
});
