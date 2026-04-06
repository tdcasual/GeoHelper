import { createMemoryAgentStore } from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";

const parseStreamFrames = (payload: string) =>
  payload
    .trim()
    .split("\n\n")
    .map((block) => {
      const eventLine = block
        .split("\n")
        .find((line) => line.startsWith("event: "));
      const dataLine = block
        .split("\n")
        .find((line) => line.startsWith("data: "));

      if (!eventLine || !dataLine) {
        throw new Error("missing stream frame payload");
      }

      return {
        event: eventLine.slice(7),
        data: JSON.parse(dataLine.slice(6)) as unknown
      };
    });

const parseStreamSnapshot = (payload: string) => {
  const snapshotFrame = parseStreamFrames(payload).find(
    (frame) => frame.event === "run.snapshot"
  );

  if (!snapshotFrame) {
    throw new Error("missing run snapshot event payload");
  }

  return snapshotFrame.data as {
    run: {
      id: string;
      profileId: string;
      status: string;
    };
    events: Array<{
      type: string;
    }>;
    childRuns: Array<{
      id: string;
      profileId: string;
      parentRunId?: string;
      status: string;
    }>;
    checkpoints: Array<{
      kind: string;
      status: string;
    }>;
  };
};

describe("control-plane runs routes", () => {
  it("lists registered run profiles", async () => {
    const app = buildServer();

    const catalogRes = await app.inject({
      method: "GET",
      url: "/api/v3/platform/catalog"
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/v3/run-profiles"
    });

    expect(catalogRes.statusCode).toBe(200);
    expect(res.statusCode).toBe(200);
    const catalog = JSON.parse(catalogRes.payload);

    expect(JSON.parse(res.payload)).toEqual({
      runProfiles: catalog.catalog.runProfiles
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

  it("gets an existing thread", async () => {
    const app = buildServer({
      now: () => "2026-04-04T00:00:00.000Z"
    });

    await app.inject({
      method: "POST",
      url: "/api/v3/threads",
      payload: {
        title: "Triangle lesson"
      }
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v3/threads/thread_1"
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      thread: {
        id: "thread_1",
        title: "Triangle lesson",
        createdAt: "2026-04-04T00:00:00.000Z"
      }
    });
  });

  it("returns 404 when a thread does not exist", async () => {
    const app = buildServer();

    const res = await app.inject({
      method: "GET",
      url: "/api/v3/threads/thread_missing"
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.payload)).toEqual({
      error: "thread_not_found"
    });
  });

  it("starts a run and streams the worker-progressed snapshot as server-sent events", async () => {
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
      url: "/api/v3/runs/run_1/stream?afterSequence=1"
    });

    expect(streamRes.statusCode).toBe(200);
    expect(streamRes.headers["content-type"]).toContain("text/event-stream");
    expect(streamRes.payload).toContain("event: run.snapshot");
    expect(streamRes.payload).toContain("event: run.event");

    const frames = parseStreamFrames(streamRes.payload);
    const snapshot = parseStreamSnapshot(streamRes.payload);
    const streamedEvents = frames
      .filter((frame) => frame.event === "run.event")
      .map((frame) => frame.data as { sequence: number; type: string });

    expect(snapshot.run).toEqual(
      expect.objectContaining({
        id: "run_1",
        profileId: "platform_geometry_quick_draft",
        status: "waiting_for_checkpoint"
      })
    );
    expect(snapshot.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["run.created", "checkpoint.waiting"])
    );
    expect(snapshot.checkpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "tool_result",
          status: "pending"
        })
      ])
    );
    expect(streamedEvents.length).toBeGreaterThan(0);
    expect(streamedEvents.every((event) => event.sequence > 1)).toBe(true);
    expect(streamedEvents.map((event) => event.type)).not.toContain("run.created");
  });

  it("gets an existing run and its event log", async () => {
    const store = createMemoryAgentStore();

    await store.runs.createRun({
      id: "run_1",
      threadId: "thread_1",
      profileId: "platform_geometry_standard",
      status: "waiting_for_checkpoint",
      inputArtifactIds: ["artifact_input_1"],
      outputArtifactIds: [],
      budget: {
        maxModelCalls: 6,
        maxToolCalls: 8,
        maxDurationMs: 120000
      },
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:00:05.000Z"
    });
    await store.events.appendRunEvent({
      id: "event_1",
      runId: "run_1",
      sequence: 1,
      type: "run.created",
      payload: {
        profileId: "platform_geometry_standard"
      },
      createdAt: "2026-04-04T00:00:00.000Z"
    });
    await store.events.appendRunEvent({
      id: "event_2",
      runId: "run_1",
      sequence: 2,
      type: "checkpoint.waiting",
      payload: {
        checkpointId: "checkpoint_1"
      },
      createdAt: "2026-04-04T00:00:05.000Z"
    });

    const app = buildServer({
      store
    });

    const runRes = await app.inject({
      method: "GET",
      url: "/api/v3/runs/run_1"
    });
    const eventsRes = await app.inject({
      method: "GET",
      url: "/api/v3/runs/run_1/events"
    });

    expect(runRes.statusCode).toBe(200);
    expect(JSON.parse(runRes.payload)).toEqual({
      run: expect.objectContaining({
        id: "run_1",
        threadId: "thread_1",
        profileId: "platform_geometry_standard",
        status: "waiting_for_checkpoint"
      })
    });
    expect(eventsRes.statusCode).toBe(200);
    expect(JSON.parse(eventsRes.payload)).toEqual({
      events: [
        expect.objectContaining({
          id: "event_1",
          sequence: 1,
          type: "run.created"
        }),
        expect.objectContaining({
          id: "event_2",
          sequence: 2,
          type: "checkpoint.waiting"
        })
      ]
    });
  });

  it("returns 404 for missing run detail and events routes", async () => {
    const app = buildServer();

    const runRes = await app.inject({
      method: "GET",
      url: "/api/v3/runs/run_missing"
    });
    const eventsRes = await app.inject({
      method: "GET",
      url: "/api/v3/runs/run_missing/events"
    });

    expect(runRes.statusCode).toBe(404);
    expect(JSON.parse(runRes.payload)).toEqual({
      error: "run_not_found"
    });
    expect(eventsRes.statusCode).toBe(404);
    expect(JSON.parse(eventsRes.payload)).toEqual({
      error: "run_not_found"
    });
  });

  it("includes direct child runs inside streamed run snapshots", async () => {
    const store = createMemoryAgentStore();

    await store.runs.createRun({
      id: "run_parent",
      threadId: "thread_1",
      profileId: "platform_geometry_standard",
      status: "waiting_for_subagent",
      inputArtifactIds: [],
      outputArtifactIds: [],
      budget: {
        maxModelCalls: 6,
        maxToolCalls: 8,
        maxDurationMs: 120000
      },
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:00:10.000Z"
    });
    await store.runs.createRun({
      id: "run_child_1",
      threadId: "thread_1",
      profileId: "platform_geometry_quick_draft",
      status: "running",
      parentRunId: "run_parent",
      inputArtifactIds: [],
      outputArtifactIds: [],
      budget: {
        maxModelCalls: 3,
        maxToolCalls: 4,
        maxDurationMs: 60000
      },
      createdAt: "2026-04-04T00:00:02.000Z",
      updatedAt: "2026-04-04T00:00:08.000Z"
    });

    const app = buildServer({
      store
    });

    const streamRes = await app.inject({
      method: "GET",
      url: "/api/v3/runs/run_parent/stream"
    });

    expect(streamRes.statusCode).toBe(200);

    const snapshot = parseStreamSnapshot(streamRes.payload);

    expect(snapshot.childRuns).toEqual([
      expect.objectContaining({
        id: "run_child_1",
        parentRunId: "run_parent",
        profileId: "platform_geometry_quick_draft",
        status: "running"
      })
    ]);
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
