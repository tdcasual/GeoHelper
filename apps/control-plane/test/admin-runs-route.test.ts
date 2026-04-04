import { createMemoryAgentStore } from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";

describe("control-plane admin routes", () => {
  it("lists runs with status filters", async () => {
    const store = createMemoryAgentStore();

    await store.runs.createRun({
      id: "run_completed",
      threadId: "thread_1",
      profileId: "platform_geometry_standard",
      status: "completed",
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

    await store.runs.createRun({
      id: "run_waiting",
      threadId: "thread_2",
      profileId: "platform_geometry_standard",
      status: "waiting_for_checkpoint",
      inputArtifactIds: [],
      outputArtifactIds: [],
      budget: {
        maxModelCalls: 6,
        maxToolCalls: 8,
        maxDurationMs: 120000
      },
      createdAt: "2026-04-04T00:01:00.000Z",
      updatedAt: "2026-04-04T00:01:00.000Z"
    });

    const app = buildServer({
      store
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin/runs?status=waiting_for_checkpoint"
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      runs: [
        expect.objectContaining({
          id: "run_waiting",
          status: "waiting_for_checkpoint"
        })
      ]
    });
  });

  it("inspects the node timeline for a run", async () => {
    const store = createMemoryAgentStore();

    await store.runs.createRun({
      id: "run_1",
      threadId: "thread_1",
      profileId: "platform_geometry_standard",
      status: "completed",
      inputArtifactIds: [],
      outputArtifactIds: [],
      budget: {
        maxModelCalls: 6,
        maxToolCalls: 8,
        maxDurationMs: 120000
      },
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:01:00.000Z"
    });

    await store.events.appendRunEvent({
      id: "event_1",
      runId: "run_1",
      sequence: 1,
      type: "node.started",
      payload: {
        nodeId: "node_plan_geometry"
      },
      createdAt: "2026-04-04T00:00:00.000Z"
    });

    await store.events.appendRunEvent({
      id: "event_2",
      runId: "run_1",
      sequence: 2,
      type: "node.completed",
      payload: {
        nodeId: "node_plan_geometry"
      },
      createdAt: "2026-04-04T00:00:01.000Z"
    });

    const app = buildServer({
      store
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin/runs/run_1/timeline"
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      run: expect.objectContaining({
        id: "run_1",
        profileId: "platform_geometry_standard"
      }),
      events: [
        expect.objectContaining({
          type: "node.started"
        }),
        expect.objectContaining({
          type: "node.completed"
        })
      ],
      checkpoints: [],
      memoryEntries: []
    });
  });

  it("lists pending checkpoints across runs", async () => {
    const store = createMemoryAgentStore();

    await store.checkpoints.upsertCheckpoint({
      id: "checkpoint_pending",
      runId: "run_1",
      nodeId: "node_teacher_checkpoint",
      kind: "human_input",
      status: "pending",
      title: "Pending review",
      prompt: "请确认是否继续执行。",
      createdAt: "2026-04-04T00:00:00.000Z"
    });

    await store.checkpoints.upsertCheckpoint({
      id: "checkpoint_resolved",
      runId: "run_2",
      nodeId: "node_teacher_checkpoint",
      kind: "approval",
      status: "resolved",
      title: "Resolved review",
      prompt: "已处理",
      response: {
        approved: true
      },
      createdAt: "2026-04-04T00:00:00.000Z",
      resolvedAt: "2026-04-04T00:01:00.000Z"
    });

    const app = buildServer({
      store
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin/checkpoints?status=pending"
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      checkpoints: [
        expect.objectContaining({
          id: "checkpoint_pending",
          status: "pending"
        })
      ]
    });
  });

  it("shows memory writes for a run", async () => {
    const store = createMemoryAgentStore();

    await store.memory.writeMemoryEntry({
      id: "memory_1",
      scope: "thread",
      scopeId: "thread_1",
      key: "teacher_preference",
      value: {
        tone: "concise"
      },
      sourceRunId: "run_1",
      sourceArtifactId: "artifact_1",
      createdAt: "2026-04-04T00:00:00.000Z"
    });

    const app = buildServer({
      store
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin/memory/writes?runId=run_1"
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      memoryEntries: [
        expect.objectContaining({
          id: "memory_1",
          sourceRunId: "run_1"
        })
      ]
    });
  });
});
