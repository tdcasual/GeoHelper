import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { createMemoryCompileEventSink } from "../src/services/compile-events";
import { clearRateLimits } from "../src/services/rate-limit";
import {
  createGeometryAgentResponder,
  createGeometryDraftFixture,
  createGeometryReviewFixture
} from "./helpers/geometry-agent-stub";

describe("POST /api/v1/chat/compile", () => {
  it("returns validated command batch", async () => {
    clearRateLimits();

    const app = buildServer(
      {},
      {
        requestCommandBatch: createGeometryAgentResponder()
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      payload: {
        message: "画一个半径为3的圆",
        mode: "byok"
      }
    });

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload.batch.version).toBe("1.0");
    expect(Array.isArray(payload.agent_steps)).toBe(true);
    expect(payload.agent_steps.length).toBeGreaterThanOrEqual(3);
    expect(res.headers.deprecation).toBe("true");
    expect(res.headers.link).toContain("/api/v2/agent/runs");
  });


  it("rejects attachments when gateway attachment capability is disabled", async () => {
    clearRateLimits();

    const app = buildServer(
      {},
      {
        requestCommandBatch: createGeometryAgentResponder()
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      payload: {
        message: "根据图片画出三角形",
        mode: "byok",
        attachments: [
          {
            id: "img_1",
            kind: "image",
            name: "triangle.png",
            mimeType: "image/png",
            size: 1234,
            transportPayload: "data:image/png;base64,AAAA"
          }
        ]
      }
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload)).toEqual({
      error: {
        code: "ATTACHMENTS_UNSUPPORTED",
        message: "Gateway runtime does not support attachments yet"
      }
    });
    expect(res.headers.deprecation).toBe("true");
    expect(res.headers.link).toContain("/api/v2/agent/runs");
  });

  it("accepts image attachments when capability is enabled and records safe metadata", async () => {
    clearRateLimits();

    const compileEventSink = createMemoryCompileEventSink();
    let capturedInput:
      | {
          attachments?: Array<{ mimeType: string; transportPayload: string }>;
        }
      | undefined;

    const app = buildServer(
      {
        GATEWAY_ENABLE_ATTACHMENTS: "1"
      },
      {
        compileEventSink,
        requestCommandBatch: createGeometryAgentResponder({
          onRequest: (input) => {
            if (input.systemPrompt?.includes("GeometryDraftPackage")) {
              capturedInput = input as typeof capturedInput;
            }
          }
        })
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
            id: "img_1",
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
    expect(capturedInput?.attachments).toHaveLength(1);
    expect(capturedInput?.attachments?.[0]?.mimeType).toBe("image/png");

    const successEvent = compileEventSink
      .readAll()
      .find((event) => event.event === "compile_success");
    expect(successEvent?.metadata).toEqual(
      expect.objectContaining({
      attachments_count: 1,
      attachment_kinds: ["image"]
      })
    );
    expect(JSON.stringify(compileEventSink.readAll())).not.toContain(
      "data:image/png;base64,AAAA"
    );
  });

  it("repairs invalid first draft and still succeeds", async () => {
    clearRateLimits();

    const draftWithInvalidBatch = createGeometryDraftFixture({
      commandBatchDraft: {
        version: "1.0",
        scene_id: "scene_invalid",
        transaction_id: "tx_invalid",
        commands: [
          {
            id: "c1",
            op: "create_line",
            args: {
              from: "A",
              to: "A"
            },
            depends_on: [],
            idempotency_key: "k1"
          }
        ],
        post_checks: [],
        explanations: ["初稿包含无效命令"]
      }
    });
    const repairedDraft = createGeometryDraftFixture({
      commandBatchDraft: {
        version: "1.0",
        scene_id: "scene_repaired",
        transaction_id: "tx_repaired",
        commands: [],
        post_checks: [],
        explanations: ["修正后草案"]
      }
    });
    const app = buildServer(
      {},
      {
        requestCommandBatch: createGeometryAgentResponder({
          drafts: [draftWithInvalidBatch, repairedDraft],
          reviews: [
            createGeometryReviewFixture({
              verdict: "revise",
              summary: ["命令草案包含无效操作"],
              repairInstructions: ["请移除无效命令并重新生成可执行草案"]
            }),
            createGeometryReviewFixture()
          ]
        })
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      payload: {
        message: "画一个半径为3的圆",
        mode: "byok"
      }
    });

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload.batch.version).toBe("1.0");
    const repairStep = payload.agent_steps.find(
      (step: { name: string; status: string }) => step.name === "repair"
    );
    expect(repairStep).toBeTruthy();
    expect(repairStep.status).toBe("ok");
  });
});
