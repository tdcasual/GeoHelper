import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("deploy docs", () => {
  it("documents geogebra self-hosted vendor sync before web build", () => {
    const txt = fs.readFileSync("docs/deploy/edgeone.md", "utf8");
    expect(txt).toContain("pnpm geogebra:sync");
    expect(txt).toContain("latest");
    expect(txt).toContain("fallback");
    expect(txt).toContain("vendor/geogebra/manifest.json");
    expect(txt).toContain("GATEWAY_ENABLE_ATTACHMENTS");
    expect(txt).toContain("attachments_enabled");
    expect(txt).toContain("lightweight cloud sync");
    expect(txt).toContain("snapshot-based");
    expect(txt).toContain("metadata-only startup freshness checks");
    expect(txt).toContain("delayed upload");
    expect(txt).toContain("never auto-restores");
    expect(txt).toContain("browser sync defaults to guarded writes");
    expect(txt).toContain("force overwrite requires an explicit danger action");
    expect(txt).toContain("unconditional admin latest write remains available for operator/manual recovery");
  });
});
