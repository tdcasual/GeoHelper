import type {
  Checkpoint,
  MemoryEntry,
  Run,
  RunEvent
} from "@geohelper/agent-protocol";
import { createElement } from "react";
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

const childRuns: Run[] = [
  {
    id: "run_child_1",
    threadId: "thread_1",
    profileId: "platform_geometry_quick_draft",
    status: "completed",
    parentRunId: "run_1",
    inputArtifactIds: [],
    outputArtifactIds: ["artifact_child_1"],
    budget: {
      maxModelCalls: 3,
      maxToolCalls: 4,
      maxDurationMs: 60000
    },
    createdAt: "2026-04-04T00:00:20.000Z",
    updatedAt: "2026-04-04T00:00:40.000Z"
  }
];

describe("RunTimelinePage", () => {
  it("renders run timeline, pending checkpoints, memory writes, and child runs", () => {
    const markup = renderToStaticMarkup(
      createElement(RunTimelinePage, {
        run,
        events,
        checkpoints,
        memoryEntries,
        childRuns
      })
    );

    expect(markup).toContain("run_1");
    expect(markup).toContain("platform_geometry_standard");
    expect(markup).toContain("node.started");
    expect(markup).toContain("Confirm geometry draft");
    expect(markup).toContain("teacher_preference");
    expect(markup).toContain("Subagents");
    expect(markup).toContain("run_child_1");
    expect(markup).toContain("platform_geometry_quick_draft");
  });
});
