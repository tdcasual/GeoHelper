import { createMemoryAgentStore } from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";

describe("control-plane run cancel route", () => {
  it("cancels a run, clears engine state, and cancels pending checkpoints", async () => {
    const store = createMemoryAgentStore();

    await store.runs.createRun({
      id: "run_1",
      threadId: "thread_1",
      profileId: "platform_geometry_standard",
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
    await store.engineStates.upsertState({
      runId: "run_1",
      nextNodeId: "node_teacher_checkpoint",
      visitedNodeIds: ["node_plan"],
      emittedEventCount: 1,
      spawnedRunIds: [],
      budgetUsage: {
        modelCalls: 1,
        toolCalls: 0
      },
      pendingCheckpointId: "checkpoint_1",
      updatedAt: "2026-04-04T00:00:00.000Z"
    });

    const app = buildServer({
      store,
      now: () => "2026-04-04T00:01:00.000Z"
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v3/runs/run_1/cancel"
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      run: expect.objectContaining({
        id: "run_1",
        status: "cancelled",
        updatedAt: "2026-04-04T00:01:00.000Z"
      })
    });
    expect(await store.engineStates.getState("run_1")).toBeNull();
    expect(await store.checkpoints.getCheckpoint("checkpoint_1")).toEqual(
      expect.objectContaining({
        id: "checkpoint_1",
        status: "cancelled"
      })
    );
    expect(await store.events.listRunEvents("run_1")).toEqual([
      expect.objectContaining({
        type: "run.cancelled",
        payload: {
          previousStatus: "waiting_for_checkpoint"
        }
      })
    ]);
  });

  it("returns 404 when cancelling a missing run", async () => {
    const app = buildServer();

    const res = await app.inject({
      method: "POST",
      url: "/api/v3/runs/run_missing/cancel"
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.payload)).toEqual({
      error: "run_not_found"
    });
  });

  it("rejects cancelling a completed run", async () => {
    const store = createMemoryAgentStore();

    await store.runs.createRun({
      id: "run_1",
      threadId: "thread_1",
      profileId: "platform_geometry_standard",
      status: "completed",
      inputArtifactIds: [],
      outputArtifactIds: ["artifact_response_1"],
      budget: {
        maxModelCalls: 6,
        maxToolCalls: 8,
        maxDurationMs: 120000
      },
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:00:05.000Z"
    });

    const app = buildServer({
      store
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v3/runs/run_1/cancel"
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.payload)).toEqual({
      error: "run_not_cancellable",
      status: "completed"
    });
  });
});
