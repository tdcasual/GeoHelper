import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { clearRateLimits } from "../src/services/rate-limit";

describe("POST /api/v1/chat/compile", () => {
  it("returns validated command batch", async () => {
    clearRateLimits();

    const app = buildServer({}, {
      requestCommandBatch: async () => ({
        version: "1.0",
        scene_id: "s1",
        transaction_id: "t1",
        commands: [],
        post_checks: [],
        explanations: []
      })
    });

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
    expect(payload.agent_steps.length).toBeGreaterThanOrEqual(4);
  });


  it("rejects attachments explicitly because gateway vision is not supported yet", async () => {
    clearRateLimits();

    const app = buildServer({}, {
      requestCommandBatch: async () => ({
        version: "1.0",
        scene_id: "s1",
        transaction_id: "t1",
        commands: [],
        post_checks: [],
        explanations: []
      })
    });

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
  });

  it("repairs invalid first draft and still succeeds", async () => {
    clearRateLimits();

    let call = 0;
    const app = buildServer(
      {},
      {
        requestCommandBatch: async () => {
          call += 1;
          if (call === 3) {
            return {
              version: "1.0",
              scene_id: "s1",
              transaction_id: "t1",
              commands: [
                {
                  id: "c1",
                  op: "eval_js",
                  args: {},
                  depends_on: [],
                  idempotency_key: "k1"
                }
              ],
              post_checks: [],
              explanations: []
            };
          }

          return {
            version: "1.0",
            scene_id: "s1",
            transaction_id: "t1",
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
