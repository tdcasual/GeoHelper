import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createMemoryAgentStore, createSqliteAgentStore } from "../src";

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

  it("persists a run snapshot across sqlite store reopen", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "geohelper-agent-store-"));
    const databasePath = path.join(tempDir, "agent-store.sqlite");

    try {
      const store = createSqliteAgentStore({
        path: databasePath
      });

      await store.runs.createRun({
        id: "run_sqlite_1",
        threadId: "thread_sqlite_1",
        profileId: "platform_geometry_standard",
        status: "waiting_for_checkpoint",
        inputArtifactIds: ["artifact_input_1"],
        outputArtifactIds: ["artifact_output_1"],
        budget: {
          maxModelCalls: 4,
          maxToolCalls: 8,
          maxDurationMs: 60_000
        },
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z"
      });

      await store.events.appendRunEvent({
        id: "event_sqlite_1",
        runId: "run_sqlite_1",
        sequence: 1,
        type: "run.created",
        payload: {
          status: "queued"
        },
        createdAt: "2026-04-05T00:00:00.000Z"
      });

      await store.checkpoints.upsertCheckpoint({
        id: "checkpoint_sqlite_1",
        runId: "run_sqlite_1",
        nodeId: "node_review",
        kind: "human_input",
        status: "pending",
        title: "Confirm geometry draft",
        prompt: "请确认是否继续执行。",
        createdAt: "2026-04-05T00:00:00.000Z"
      });

      await store.artifacts.writeArtifact({
        id: "artifact_input_1",
        runId: "run_sqlite_1",
        kind: "input",
        contentType: "application/json",
        storage: "inline",
        metadata: {
          source: "sqlite"
        },
        inlineData: {
          prompt: "构造外接圆"
        },
        createdAt: "2026-04-05T00:00:00.000Z"
      });

      await store.memory.writeMemoryEntry({
        id: "memory_sqlite_1",
        scope: "thread",
        scopeId: "thread_sqlite_1",
        key: "teacher_preference",
        value: {
          prefersConciseSummary: true
        },
        sourceRunId: "run_sqlite_1",
        sourceArtifactId: "artifact_input_1",
        createdAt: "2026-04-05T00:00:00.000Z"
      });

      const reopened = createSqliteAgentStore({
        path: databasePath
      });
      const snapshot = await reopened.loadRunSnapshot("run_sqlite_1");

      expect(snapshot?.run.status).toBe("waiting_for_checkpoint");
      expect(snapshot?.events.map((event) => event.type)).toEqual(["run.created"]);
      expect(snapshot?.checkpoints.map((checkpoint) => checkpoint.id)).toEqual([
        "checkpoint_sqlite_1"
      ]);
      expect(snapshot?.artifacts.map((artifact) => artifact.id)).toEqual([
        "artifact_input_1"
      ]);
      expect(snapshot?.memoryEntries.map((entry) => entry.id)).toEqual([
        "memory_sqlite_1"
      ]);
    } finally {
      rmSync(tempDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("lists filtered runs and checkpoints after sqlite store reopen", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "geohelper-agent-store-"));
    const databasePath = path.join(tempDir, "agent-store.sqlite");

    try {
      const store = createSqliteAgentStore({
        path: databasePath
      });

      await store.runs.createRun({
        id: "run_sqlite_pending",
        threadId: "thread_1",
        profileId: "platform_geometry_standard",
        status: "queued",
        inputArtifactIds: [],
        outputArtifactIds: [],
        budget: {
          maxModelCalls: 4,
          maxToolCalls: 8,
          maxDurationMs: 60_000
        },
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z"
      });

      await store.runs.createRun({
        id: "run_sqlite_completed",
        threadId: "thread_2",
        profileId: "platform_geometry_quick_draft",
        status: "completed",
        inputArtifactIds: [],
        outputArtifactIds: [],
        budget: {
          maxModelCalls: 3,
          maxToolCalls: 4,
          maxDurationMs: 30_000
        },
        createdAt: "2026-04-05T00:01:00.000Z",
        updatedAt: "2026-04-05T00:01:00.000Z"
      });

      await store.checkpoints.upsertCheckpoint({
        id: "checkpoint_sqlite_pending",
        runId: "run_sqlite_pending",
        nodeId: "node_review",
        kind: "human_input",
        status: "pending",
        title: "Pending review",
        prompt: "待老师确认",
        createdAt: "2026-04-05T00:00:00.000Z"
      });

      await store.checkpoints.upsertCheckpoint({
        id: "checkpoint_sqlite_resolved",
        runId: "run_sqlite_completed",
        nodeId: "node_review",
        kind: "approval",
        status: "resolved",
        title: "Resolved review",
        prompt: "已完成确认",
        response: {
          approved: true
        },
        createdAt: "2026-04-05T00:01:00.000Z",
        resolvedAt: "2026-04-05T00:02:00.000Z"
      });

      const reopened = createSqliteAgentStore({
        path: databasePath
      });
      const completedRuns = await reopened.runs.listRuns({
        status: "completed"
      });
      const pendingCheckpoints = await reopened.checkpoints.listCheckpointsByStatus(
        "pending"
      );

      expect(completedRuns.map((run) => run.id)).toEqual(["run_sqlite_completed"]);
      expect(pendingCheckpoints.map((checkpoint) => checkpoint.id)).toEqual([
        "checkpoint_sqlite_pending"
      ]);
    } finally {
      rmSync(tempDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("persists queued dispatches across sqlite store reopen", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "geohelper-agent-store-"));
    const databasePath = path.join(tempDir, "agent-store.sqlite");

    try {
      const store = createSqliteAgentStore({
        path: databasePath
      });

      await store.runs.createRun({
        id: "run_sqlite_pending",
        threadId: "thread_sqlite_pending",
        profileId: "platform_geometry_standard",
        status: "queued",
        inputArtifactIds: [],
        outputArtifactIds: [],
        budget: {
          maxModelCalls: 4,
          maxToolCalls: 8,
          maxDurationMs: 60_000
        },
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z"
      });
      await store.dispatches.enqueueRun("run_sqlite_pending");

      const reopened = createSqliteAgentStore({
        path: databasePath
      });
      const claimed = await reopened.dispatches.claimNextDispatch({
        workerId: "worker_1",
        claimedAt: "2026-04-05T00:03:00.000Z"
      });

      expect(claimed).toEqual(
        expect.objectContaining({
          runId: "run_sqlite_pending",
          workerId: "worker_1"
        })
      );
      expect(
        await reopened.dispatches.claimNextDispatch({
          workerId: "worker_2",
          claimedAt: "2026-04-05T00:04:00.000Z"
        })
      ).toBeNull();
    } finally {
      rmSync(tempDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("persists threads and browser sessions across sqlite store reopen", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "geohelper-agent-store-"));
    const databasePath = path.join(tempDir, "agent-store.sqlite");

    try {
      const store = createSqliteAgentStore({
        path: databasePath
      });

      await store.threads.createThread({
        id: "thread_sqlite_1",
        title: "Triangle lesson",
        createdAt: "2026-04-05T00:00:00.000Z"
      });
      await store.runs.createRun({
        id: "run_sqlite_session",
        threadId: "thread_sqlite_1",
        profileId: "platform_geometry_standard",
        status: "waiting_for_checkpoint",
        inputArtifactIds: [],
        outputArtifactIds: [],
        budget: {
          maxModelCalls: 4,
          maxToolCalls: 8,
          maxDurationMs: 60_000
        },
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z"
      });
      await store.browserSessions.createSession({
        id: "browser_session_sqlite_1",
        runId: "run_sqlite_session",
        allowedToolNames: ["scene.read_state", "scene.apply_command_batch"],
        createdAt: "2026-04-05T00:00:05.000Z"
      });

      const reopened = createSqliteAgentStore({
        path: databasePath
      });

      expect(await reopened.threads.getThread("thread_sqlite_1")).toEqual(
        expect.objectContaining({
          id: "thread_sqlite_1",
          title: "Triangle lesson"
        })
      );
      expect(
        await reopened.browserSessions.getSession("browser_session_sqlite_1")
      ).toEqual(
        expect.objectContaining({
          runId: "run_sqlite_session",
          allowedToolNames: ["scene.read_state", "scene.apply_command_batch"]
        })
      );
    } finally {
      rmSync(tempDir, {
        recursive: true,
        force: true
      });
    }
  });
});
