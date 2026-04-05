import type { RunSnapshot } from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import { createRunStore } from "./run-store";

const createSnapshot = (status: "queued" | "completed", eventCount: number): RunSnapshot => ({
  run: {
    id: "run_1",
    threadId: "thread_1",
    profileId: "platform_geometry_standard",
    status,
    inputArtifactIds: ["artifact_input_1"],
    outputArtifactIds: [],
    budget: {
      maxModelCalls: 6,
      maxToolCalls: 8,
      maxDurationMs: 120000
    },
    createdAt: "2026-04-04T00:00:00.000Z",
    updatedAt: "2026-04-04T00:00:00.000Z"
  },
  events: Array.from({ length: eventCount }, (_, index) => ({
    id: `event_${index + 1}`,
    runId: "run_1",
    sequence: index + 1,
    type: index === eventCount - 1 && status === "completed"
      ? "run.completed"
      : "run.created",
    payload: {
      index
    },
    createdAt: "2026-04-04T00:00:00.000Z"
  })),
  checkpoints: [],
  artifacts: [],
  childRuns: [
    {
      id: "run_child_1",
      threadId: "thread_1",
      profileId: "platform_geometry_quick_draft",
      status: "running",
      parentRunId: "run_1",
      inputArtifactIds: [],
      outputArtifactIds: [],
      budget: {
        maxModelCalls: 3,
        maxToolCalls: 4,
        maxDurationMs: 60000
      },
      createdAt: "2026-04-04T00:00:00.500Z",
      updatedAt: "2026-04-04T00:00:01.000Z"
    }
  ],
  memoryEntries: []
});

describe("createRunStore", () => {
  it("applies streamed run snapshots into store state", () => {
    const store = createRunStore();

    store.getState().applyStreamSnapshot(createSnapshot("queued", 1));
    expect(store.getState().runsById.run_1?.status).toBe("queued");
    expect(store.getState().eventsByRunId.run_1).toHaveLength(1);

    store.getState().applyStreamSnapshot(createSnapshot("completed", 2));

    expect(store.getState().latestRunId).toBe("run_1");
    expect(store.getState().runsById.run_1?.status).toBe("completed");
    expect(store.getState().runsById.run_child_1?.parentRunId).toBe("run_1");
    expect(store.getState().childRunsByParentRunId.run_1).toEqual([
      expect.objectContaining({
        id: "run_child_1",
        profileId: "platform_geometry_quick_draft"
      })
    ]);
    expect(store.getState().eventsByRunId.run_1).toHaveLength(2);
    expect(store.getState().eventsByRunId.run_1?.at(-1)?.type).toBe(
      "run.completed"
    );
  });
});
