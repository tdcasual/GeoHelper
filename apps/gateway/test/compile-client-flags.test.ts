import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { clearRateLimits } from "../src/services/rate-limit";
import { resetGatewayMetrics } from "../src/services/metrics";

describe("POST /api/v1/chat/compile client flags", () => {
  it("uses single-agent fallback path when requested", async () => {
    clearRateLimits();
    resetGatewayMetrics();

    let callCount = 0;
    const app = buildServer(
      {},
      {
        requestCommandBatch: async () => {
          callCount += 1;
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
      headers: {
        "x-client-fallback-single-agent": "1"
      },
      payload: {
        message: "画一个圆",
        mode: "byok"
      }
    });

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload.agent_steps).toHaveLength(1);
    expect(payload.agent_steps[0].name).toBe("command");
    expect(payload.agent_steps[0].status).toBe("ok");
    expect(callCount).toBe(1);
  });

  it("returns perf headers when performance sampling is requested", async () => {
    clearRateLimits();
    resetGatewayMetrics();

    const app = buildServer(
      {},
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

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      headers: {
        "x-client-performance-sampling": "1"
      },
      payload: {
        message: "画一个圆",
        mode: "byok"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(Number(res.headers["x-perf-total-ms"])).toBeGreaterThanOrEqual(0);
    expect(Number(res.headers["x-perf-upstream-ms"])).toBeGreaterThanOrEqual(0);
  });
});
