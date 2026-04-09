import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";

describe("control-plane health routes", () => {
  it("reports shallow liveness", async () => {
    const app = buildServer({
      now: () => "2026-04-09T10:00:00.000Z"
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v3/health"
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      status: "ok",
      service: "control-plane",
      time: "2026-04-09T10:00:00.000Z"
    });
  });

  it("reports readiness with registry counts and inline worker loop mode", async () => {
    const app = buildServer({
      now: () => "2026-04-09T10:00:00.000Z"
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v3/ready"
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      ready: true,
      service: "control-plane",
      time: "2026-04-09T10:00:00.000Z",
      executionMode: "inline_worker_loop",
      dependencies: expect.arrayContaining([
        expect.objectContaining({
          name: "agent_store",
          status: "ok"
        }),
        expect.objectContaining({
          name: "runtime_registry",
          status: "ok",
          details: expect.objectContaining({
            runProfileCount: expect.any(Number),
            agentCount: expect.any(Number),
            workflowCount: expect.any(Number)
          })
        })
      ])
    });
  });

  it("fails readiness when the runtime registry is empty", async () => {
    const app = buildServer({
      now: () => "2026-04-09T10:00:00.000Z",
      runProfiles: new Map()
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v3/ready"
    });

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.payload)).toEqual({
      ready: false,
      service: "control-plane",
      time: "2026-04-09T10:00:00.000Z",
      executionMode: "inline_worker_loop",
      dependencies: expect.arrayContaining([
        expect.objectContaining({
          name: "runtime_registry",
          status: "error",
          message: "no run profiles registered"
        })
      ])
    });
  });
});
