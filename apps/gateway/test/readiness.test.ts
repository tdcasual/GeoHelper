import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { createRuntimeReadinessService } from "../src/services/runtime-readiness";

describe("GET /api/v1/ready", () => {
  it("returns ready in local/default mode", async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/api/v1/ready" });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      ready: true,
      dependencies: []
    });
  });

  it("returns 503 when a configured dependency probe fails", async () => {
    const app = buildServer(
      {},
      {
        runtimeReadinessService: createRuntimeReadinessService([
          {
            name: "redis",
            check: async () => {
              throw new Error("REDIS_UNAVAILABLE");
            }
          }
        ])
      }
    );

    const res = await app.inject({ method: "GET", url: "/api/v1/ready" });

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.payload)).toEqual({
      ready: false,
      dependencies: [
        {
          name: "redis",
          ok: false,
          detail: "REDIS_UNAVAILABLE"
        }
      ]
    });
  });
});
