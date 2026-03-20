import fs from "node:fs";

import { describe, expect, it } from "vitest";

describe("legacy compile cutover docs", () => {
  it("archives the old cutover checklist after v1 removal", () => {
    const txt = fs.readFileSync(
      "docs/deploy/legacy-compile-external-consumer-checklist.md",
      "utf8"
    );

    expect(txt).toContain("/api/v1/chat/compile");
    expect(txt).toContain("/api/v2/agent/runs");
    expect(txt).toContain("archived");
    expect(txt).toContain("route has been removed");
    expect(txt).not.toContain("pnpm ops:legacy-compile-check");
    expect(txt).not.toContain("7 consecutive days");
  });
});
