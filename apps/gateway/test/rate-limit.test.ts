import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { clearRateLimits } from "../src/services/rate-limit";

describe("rate limiting", () => {
  it("returns 429 when request quota is exceeded", async () => {
    clearRateLimits();

    const app = buildServer(
      {
        RATE_LIMIT_MAX: "1",
        RATE_LIMIT_WINDOW_MS: "60000"
      },
      {
        requestCommandBatch: async () => ({
          version: "1.0",
          scene_id: "s1",
          transaction_id: "t1",
          commands: [],
          post_checks: [],
          explanations: []
        })
      }
    );

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      payload: {
        message: "画一个圆",
        mode: "byok"
      }
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      payload: {
        message: "再画一个圆",
        mode: "byok"
      }
    });
    expect(second.statusCode).toBe(429);
  });
});
