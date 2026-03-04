import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("workspace structure", () => {
  it("contains required app and package folders", () => {
    expect(existsSync("apps/web")).toBe(true);
    expect(existsSync("apps/gateway")).toBe(true);
    expect(existsSync("packages/protocol")).toBe(true);
  });
});
