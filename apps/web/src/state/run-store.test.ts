import type { RunSnapshot } from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import { createRunStore } from "./run-store";

const createSnapshot = (status: "queued" | "completed", eventCount: number): RunSnapshot => ({
  run: {
    id: "run_1",
    threadId: "thread_1",
    workflowId: "wf_geometry_solver",
    agentId: "geometry_solver",
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
    expect(store.getState().eventsByRunId.run_1).toHaveLength(2);
    expect(store.getState().eventsByRunId.run_1?.at(-1)?.type).toBe(
      "run.completed"
    );
  });
});
