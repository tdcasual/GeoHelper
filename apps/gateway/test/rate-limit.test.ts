import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { createMemoryKvClient } from "../src/services/kv-client";
import { createRedisRateLimitStore } from "../src/services/redis-rate-limit-store";
import { createMemoryRateLimitStore } from "../src/services/rate-limit-store";

describe("rate limiting", () => {
  it("returns 429 when request quota is exceeded", async () => {
    const rateLimitStore = createMemoryRateLimitStore();

    const app = buildServer(
      {
        RATE_LIMIT_MAX: "1",
        RATE_LIMIT_WINDOW_MS: "60000"
      },
      {
        rateLimitStore,
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

  it("shares a fixed window limit across server instances with shared kv", async () => {
    const kvClient = createMemoryKvClient();
    const env = {
      RATE_LIMIT_MAX: "1",
      RATE_LIMIT_WINDOW_MS: "60000",
      REDIS_URL: "redis://shared-test"
    };

    const firstApp = buildServer(
      env,
      {
        kvClient,
        rateLimitStore: createRedisRateLimitStore(kvClient),
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

    const secondApp = buildServer(
      env,
      {
        kvClient,
        rateLimitStore: createRedisRateLimitStore(kvClient),
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

    const first = await firstApp.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      payload: {
        message: "画一个圆",
        mode: "byok"
      }
    });
    expect(first.statusCode).toBe(200);

    const second = await secondApp.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      payload: {
        message: "再画一个圆",
        mode: "byok"
      }
    });
    expect(second.statusCode).toBe(429);
    expect(second.headers["x-ratelimit-limit"]).toBe("1");
    expect(second.headers["x-ratelimit-remaining"]).toBe("0");
  });
});
