import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { clearRateLimits } from "../src/services/rate-limit";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

describe("api contract doc", () => {
  it("includes auth and compile endpoints", () => {
    const docPath = path.resolve(currentDir, "../../../docs/api/m0-m1-contract.md");
    const doc = fs.readFileSync(docPath, "utf8");
    expect(doc).toContain("POST /api/v1/auth/token/login");
    expect(doc).toContain("POST /api/v1/chat/compile");
  });

  it("accepts a normal compile request without attachments", async () => {
    clearRateLimits();

    const app = buildServer(
      {},
      {
        requestCommandBatch: async () => ({
          version: "1.0",
          scene_id: "scene_contract",
          transaction_id: "tx_contract",
          commands: [],
          post_checks: [],
          explanations: []
        })
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      payload: {
        message: "画一个圆",
        mode: "byok"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-trace-id"]).toBe("tr_req-1");
    expect(JSON.parse(res.payload)).toMatchObject({
      trace_id: "tr_req-1",
      batch: {
        scene_id: "scene_contract",
        transaction_id: "tx_contract"
      }
    });
  });
});
