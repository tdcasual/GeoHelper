import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("beta checklist docs", () => {
  it("includes environment, rollback, known limits, and on-call sections", () => {
    const txt = fs.readFileSync("docs/BETA_CHECKLIST.md", "utf8");
    expect(txt).toContain("## Environment Variables");
    expect(txt).toContain("## Rollback Plan");
    expect(txt).toContain("## Known Limits");
    expect(txt).toContain("## On-call & Contacts");
    expect(txt).toContain("GATEWAY_ENABLE_ATTACHMENTS");
    expect(txt).toContain("vision smoke failures block promotion");
    expect(txt).toContain("direct runtime and gateway runtime can legitimately differ in vision support");
    expect(txt).toContain("lightweight cloud sync remains snapshot-based");
    expect(txt).toContain("no SQL or full cloud history backend is required");
    expect(txt).toContain("startup freshness checks are metadata-only");
    expect(txt).toContain("delayed upload is opt-in and never auto-restores");
  });
});
