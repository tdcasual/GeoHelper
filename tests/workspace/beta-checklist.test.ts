import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("beta checklist docs", () => {
  it("includes environment, rollback, known limits, and on-call sections", () => {
    const txt = fs.readFileSync("docs/BETA_CHECKLIST.md", "utf8");
    expect(txt).toContain("## Environment Variables");
    expect(txt).toContain("## Rollback Plan");
    expect(txt).toContain("## Known Limits");
    expect(txt).toContain("## On-call & Contacts");
  });
});
