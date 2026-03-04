import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("api contract doc", () => {
  it("includes auth and compile endpoints", () => {
    const docPath = path.resolve(
      process.cwd(),
      "../../docs/api/m0-m1-contract.md"
    );
    const doc = fs.readFileSync(docPath, "utf8");
    expect(doc).toContain("POST /api/v1/auth/token/login");
    expect(doc).toContain("POST /api/v1/chat/compile");
  });
});
