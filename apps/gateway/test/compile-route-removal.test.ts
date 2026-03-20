import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

describe("legacy compile route removal", () => {
  it("does not register the legacy compile route and returns 404 for v1", async () => {
    const serverSource = await readFile(
      path.resolve(currentDir, "../src/server.ts"),
      "utf8"
    );

    expect(serverSource).not.toContain("registerCompileRoute");

    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      payload: {
        message: "画一个圆",
        mode: "byok"
      }
    });

    expect(res.statusCode).toBe(404);
  });
});
