import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

describe("POST /api/v1/chat/compile", () => {
  it("returns validated command batch", async () => {
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
    expect(JSON.parse(res.payload).batch.version).toBe("1.0");
  });
});
