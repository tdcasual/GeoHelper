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

  it("accepts an attachment compile request when gateway attachments are enabled", async () => {
    clearRateLimits();

    let attachmentCount = 0;
    const app = buildServer(
      {
        GATEWAY_ENABLE_ATTACHMENTS: "1"
      },
      {
        requestCommandBatch: async (input) => {
          attachmentCount = ((input as { attachments?: unknown[] }).attachments ?? []).length;
          return {
            version: "1.0",
            scene_id: "scene_contract_attachment",
            transaction_id: "tx_contract_attachment",
            commands: [],
            post_checks: [],
            explanations: []
          };
        }
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      headers: {
        "x-client-fallback-single-agent": "1"
      },
      payload: {
        message: "根据图片画出三角形",
        mode: "byok",
        attachments: [
          {
            id: "img_contract",
            kind: "image",
            name: "triangle.png",
            mimeType: "image/png",
            size: 1234,
            transportPayload: "data:image/png;base64,AAAA"
          }
        ]
      }
    });

    expect(res.statusCode).toBe(200);
    expect(attachmentCount).toBe(1);
    expect(JSON.parse(res.payload)).toMatchObject({
      trace_id: "tr_req-1",
      batch: {
        scene_id: "scene_contract_attachment",
        transaction_id: "tx_contract_attachment"
      }
    });
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
