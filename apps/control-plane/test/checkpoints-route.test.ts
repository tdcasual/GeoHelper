import { createMemoryAgentStore } from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";

describe("control-plane checkpoint routes", () => {
  it("resolves a pending checkpoint", async () => {
    const store = createMemoryAgentStore();

    await store.runs.createRun({
      id: "run_1",
      threadId: "thread_1",
      workflowId: "wf_geometry_solver",
      agentId: "geometry_solver",
      status: "waiting_for_checkpoint",
      inputArtifactIds: [],
      outputArtifactIds: [],
      budget: {
        maxModelCalls: 6,
        maxToolCalls: 8,
        maxDurationMs: 120000
      },
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:00:00.000Z"
    });

    await store.checkpoints.upsertCheckpoint({
      id: "checkpoint_1",
      runId: "run_1",
      nodeId: "node_teacher_checkpoint",
      kind: "human_input",
      status: "pending",
      title: "Confirm geometry draft",
      prompt: "请确认是否继续执行。",
      createdAt: "2026-04-04T00:00:00.000Z"
    });

    const app = buildServer({
      store,
      now: () => "2026-04-04T00:01:00.000Z"
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v3/checkpoints/checkpoint_1/resolve",
      payload: {
        response: {
          approved: true
        }
      }
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      checkpoint: {
        id: "checkpoint_1",
        runId: "run_1",
        nodeId: "node_teacher_checkpoint",
        kind: "human_input",
        status: "resolved",
        title: "Confirm geometry draft",
        prompt: "请确认是否继续执行。",
        response: {
          approved: true
        },
        createdAt: "2026-04-04T00:00:00.000Z",
        resolvedAt: "2026-04-04T00:01:00.000Z"
      }
    });
  });

  it("rejects invalid browser tool results", async () => {
    const app = buildServer({
      now: () => "2026-04-04T00:00:00.000Z"
    });

    await app.inject({
      method: "POST",
      url: "/api/v3/threads",
      payload: {
        title: "Circle proof"
      }
    });

    await app.inject({
      method: "POST",
      url: "/api/v3/threads/thread_1/runs",
      payload: {
        agentId: "geometry_solver",
        workflowId: "wf_geometry_solver",
        inputArtifactIds: []
      }
    });

    const sessionRes = await app.inject({
      method: "POST",
      url: "/api/v3/browser-sessions",
      payload: {
        runId: "run_1",
        allowedToolNames: ["scene.read_state"]
      }
    });

    expect(sessionRes.statusCode).toBe(201);

    const invalidRes = await app.inject({
      method: "POST",
      url: "/api/v3/browser-sessions/browser_session_1/tool-results",
      payload: {
        runId: "run_1",
        toolName: "scene.apply_command_batch",
        status: "completed",
        output: {}
      }
    });

    expect(invalidRes.statusCode).toBe(400);
    expect(JSON.parse(invalidRes.payload)).toEqual({
      error: "invalid_browser_tool_result"
    });
  });
});
