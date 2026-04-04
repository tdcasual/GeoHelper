import type {
  Checkpoint,
  MemoryEntry,
  Run,
  RunEvent
} from "@geohelper/agent-protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RunTimelinePage } from "./RunTimelinePage";

const run: Run = {
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
  updatedAt: "2026-04-04T00:01:00.000Z"
};

const events: RunEvent[] = [
  {
    id: "event_1",
    runId: "run_1",
    sequence: 1,
    type: "node.started",
    payload: {
      nodeId: "node_plan_geometry"
    },
    createdAt: "2026-04-04T00:00:00.000Z"
  }
];

const checkpoints: Checkpoint[] = [
  {
    id: "checkpoint_1",
    runId: "run_1",
    nodeId: "node_teacher_checkpoint",
    kind: "human_input",
    status: "pending",
    title: "Confirm geometry draft",
    prompt: "请确认是否继续执行。",
    createdAt: "2026-04-04T00:00:30.000Z"
  }
];

const memoryEntries: MemoryEntry[] = [
  {
    id: "memory_1",
    scope: "thread",
    scopeId: "thread_1",
    key: "teacher_preference",
    value: {
      tone: "concise"
    },
    sourceRunId: "run_1",
    sourceArtifactId: "artifact_1",
    createdAt: "2026-04-04T00:00:20.000Z"
  }
];

describe("RunTimelinePage", () => {
  it("renders run timeline, pending checkpoints, and memory writes", () => {
    const markup = renderToStaticMarkup(
      <RunTimelinePage
        run={run}
        events={events}
        checkpoints={checkpoints}
        memoryEntries={memoryEntries}
      />
    );

    expect(markup).toContain("run_1");
    expect(markup).toContain("platform_geometry_standard");
    expect(markup).toContain("node.started");
    expect(markup).toContain("Confirm geometry draft");
    expect(markup).toContain("teacher_preference");
  });
});
