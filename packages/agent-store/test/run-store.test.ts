import { describe, expect, it } from "vitest";

import { createMemoryAgentStore } from "../src";

describe("agent store", () => {
  it("creates a run, appends events, and reconstructs a snapshot", async () => {
    const store = createMemoryAgentStore();

    await store.runs.createRun({
      id: "run_1",
      threadId: "thread_1",
      profileId: "platform_geometry_standard",
      status: "queued",
      inputArtifactIds: ["artifact_input_1"],
      outputArtifactIds: [],
      budget: {
        maxModelCalls: 4,
        maxToolCalls: 8,
        maxDurationMs: 60_000
      },
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:00:00.000Z"
    });

    await store.events.appendRunEvent({
      id: "event_1",
      runId: "run_1",
      sequence: 1,
      type: "run.created",
      payload: {
        status: "queued"
      },
      createdAt: "2026-04-04T00:00:00.000Z"
    });

    await store.checkpoints.upsertCheckpoint({
      id: "checkpoint_1",
      runId: "run_1",
      nodeId: "node_review",
      kind: "human_input",
      status: "pending",
      title: "Confirm construction",
      prompt: "请确认是否继续执行这轮构图。",
      createdAt: "2026-04-04T00:00:00.000Z"
    });

    await store.artifacts.writeArtifact({
      id: "artifact_input_1",
      runId: "run_1",
      kind: "input",
      contentType: "application/json",
      storage: "inline",
      metadata: {},
      inlineData: {
        prompt: "构造角平分线"
      },
      createdAt: "2026-04-04T00:00:00.000Z"
    });

    await store.memory.writeMemoryEntry({
      id: "memory_1",
      scope: "thread",
      scopeId: "thread_1",
      key: "teacher_preference",
      value: {
        prefersConciseSummary: true
      },
      sourceRunId: "run_1",
      sourceArtifactId: "artifact_input_1",
      createdAt: "2026-04-04T00:00:00.000Z"
    });

    const snapshot = await store.loadRunSnapshot("run_1");

    expect(snapshot?.run.id).toBe("run_1");
    expect(snapshot?.run.profileId).toBe("platform_geometry_standard");
    expect(snapshot?.events).toHaveLength(1);
    expect(snapshot?.checkpoints).toHaveLength(1);
    expect(snapshot?.artifacts).toHaveLength(1);
    expect(snapshot?.memoryEntries).toHaveLength(1);
  });

  it("lists checkpoints by status across runs", async () => {
    const store = createMemoryAgentStore();

    await store.checkpoints.upsertCheckpoint({
      id: "checkpoint_pending",
      runId: "run_1",
      nodeId: "node_review",
      kind: "human_input",
      status: "pending",
      title: "Pending review",
      prompt: "待老师确认",
      createdAt: "2026-04-04T00:00:00.000Z"
    });

    await store.checkpoints.upsertCheckpoint({
      id: "checkpoint_resolved",
      runId: "run_2",
      nodeId: "node_review",
      kind: "approval",
      status: "resolved",
      title: "Resolved review",
      prompt: "已完成确认",
      response: {
        approved: true
      },
      createdAt: "2026-04-04T00:00:00.000Z",
      resolvedAt: "2026-04-04T00:01:00.000Z"
    });

    const pending = await store.checkpoints.listCheckpointsByStatus("pending");
    const resolved = await store.checkpoints.listCheckpointsByStatus("resolved");

    expect(pending.map((item) => item.id)).toEqual(["checkpoint_pending"]);
    expect(resolved.map((item) => item.id)).toEqual(["checkpoint_resolved"]);
  });
});
