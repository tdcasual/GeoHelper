import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

describe("legacy multi-agent removal", () => {
  it("does not import the legacy multi-agent implementation anywhere", async () => {
    const content = await readFile(
      path.resolve(currentDir, "../src/routes/compile.ts"),
      "utf8"
    );
    expect(content.includes("multi-agent")).toBe(false);
  });
});
