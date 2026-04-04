import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";

describe("control-plane runs routes", () => {
  it("lists registered run profiles", async () => {
    const app = buildServer();

    const res = await app.inject({
      method: "GET",
      url: "/api/v3/run-profiles"
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      runProfiles: expect.arrayContaining([
        expect.objectContaining({
          id: "platform_geometry_standard",
          agentId: "geometry_solver",
          workflowId: "wf_geometry_solver"
        }),
        expect.objectContaining({
          id: "platform_geometry_quick_draft",
          defaultBudget: {
            maxModelCalls: 3,
            maxToolCalls: 4,
            maxDurationMs: 60000
          }
        })
      ])
    });
  });

  it("creates a thread", async () => {
    const app = buildServer({
      now: () => "2026-04-04T00:00:00.000Z"
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v3/threads",
      payload: {
        title: "Triangle lesson"
      }
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.payload)).toEqual({
      thread: {
        id: "thread_1",
        title: "Triangle lesson",
        createdAt: "2026-04-04T00:00:00.000Z"
      }
    });
  });

  it("starts a run and streams the current run snapshot as server-sent events", async () => {
    const app = buildServer({
      now: () => "2026-04-04T00:00:00.000Z"
    });

    await app.inject({
      method: "POST",
      url: "/api/v3/threads",
      payload: {
        title: "Angle bisector"
      }
    });

    const runRes = await app.inject({
      method: "POST",
      url: "/api/v3/threads/thread_1/runs",
      payload: {
        profileId: "platform_geometry_quick_draft",
        inputArtifactIds: ["artifact_input_1"]
      }
    });

    expect(runRes.statusCode).toBe(202);
    expect(JSON.parse(runRes.payload)).toEqual({
      run: {
        id: "run_1",
        threadId: "thread_1",
        profileId: "platform_geometry_quick_draft",
        status: "queued",
        inputArtifactIds: ["artifact_input_1"],
        outputArtifactIds: [],
        budget: {
          maxModelCalls: 3,
          maxToolCalls: 4,
          maxDurationMs: 60000
        },
        createdAt: "2026-04-04T00:00:00.000Z",
        updatedAt: "2026-04-04T00:00:00.000Z"
      }
    });

    const streamRes = await app.inject({
      method: "GET",
      url: "/api/v3/runs/run_1/stream"
    });

    expect(streamRes.statusCode).toBe(200);
    expect(streamRes.headers["content-type"]).toContain("text/event-stream");
    expect(streamRes.payload).toContain("event: run.snapshot");
    expect(streamRes.payload).toContain("\"id\":\"run_1\"");
    expect(streamRes.payload).toContain("\"profileId\":\"platform_geometry_quick_draft\"");
    expect(streamRes.payload).toContain("\"type\":\"run.created\"");
  });

  it("rejects unknown run profiles", async () => {
    const app = buildServer({
      now: () => "2026-04-04T00:00:00.000Z"
    });

    await app.inject({
      method: "POST",
      url: "/api/v3/threads",
      payload: {
        title: "Unknown profile"
      }
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v3/threads/thread_1/runs",
      payload: {
        profileId: "missing_profile",
        inputArtifactIds: []
      }
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload)).toEqual({
      error: "unknown_run_profile",
      profileId: "missing_profile"
    });
  });
});
