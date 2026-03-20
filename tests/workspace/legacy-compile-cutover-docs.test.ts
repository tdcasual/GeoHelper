import fs from "node:fs";

import { describe, expect, it } from "vitest";

describe("legacy compile cutover docs", () => {
  it("provides an operator checklist for confirming external consumers before route removal", () => {
    const txt = fs.readFileSync(
      "docs/deploy/legacy-compile-external-consumer-checklist.md",
      "utf8"
    );

    expect(txt).toContain("/api/v1/chat/compile");
    expect(txt).toContain("/api/v2/agent/runs");
    expect(txt).toContain("pnpm ops:legacy-compile-check -- --dry-run");
    expect(txt).toContain("pnpm ops:legacy-compile-check");
    expect(txt).toContain("/admin/compile-events?limit=200");
    expect(txt).toContain('.path == "/api/v1/chat/compile"');
    expect(txt).toContain("Deprecation: true");
    expect(txt).toContain('rel=\"successor-version\"');
    expect(txt).toContain("7 consecutive days");
    expect(txt).toContain("Sign-off");
    expect(txt).toContain("Rollback");
  });
});
