import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("deploy docs", () => {
  it("documents EdgeOne static deployment steps", () => {
    const txt = fs.readFileSync("docs/deploy/edgeone.md", "utf8");
    expect(txt).toContain("EdgeOne");
    expect(txt).toContain("pnpm --filter @geohelper/web build");
  });
});
