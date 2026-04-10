import type {
  Artifact,
  Checkpoint,
  MemoryEntry,
  Run,
  RunEvent
} from "@geohelper/agent-protocol";
import type { DelegationSessionRecord } from "@geohelper/agent-store";
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

const delegationSessions: DelegationSessionRecord[] = [
  {
    id: "delegation_session_run_1_node_delegate",
    runId: "run_1",
    checkpointId: "checkpoint_1",
    delegationName: "teacher_review",
    agentRef: "openclaw.geometry-reviewer",
    status: "pending",
    outputArtifactIds: [],
    claimedBy: "executor_geometry_reviewer",
    claimedAt: "2026-04-08T00:01:00.000Z",
    claimExpiresAt: "2026-04-08T00:06:00.000Z",
    createdAt: "2026-04-08T00:00:00.000Z",
    updatedAt: "2026-04-08T00:00:00.000Z"
  },
  {
    id: "delegation_session_run_1_node_host_delegate",
    runId: "run_1",
    checkpointId: "checkpoint_1",
    delegationName: "host_review",
    agentRef: "",
    serviceRef: "host.geometry-review",
    status: "pending",
    outputArtifactIds: [],
    createdAt: "2026-04-08T00:00:10.000Z",
    updatedAt: "2026-04-08T00:00:10.000Z"
  }
];

const artifacts: Artifact[] = [
  {
    id: "artifact_plan_1",
    runId: "run_1",
    kind: "plan",
    contentType: "application/json",
    storage: "inline",
    metadata: {},
    inlineData: {
      steps: ["inspect scene", "draft response"]
    },
    createdAt: "2026-04-04T00:00:10.000Z"
  },
  {
    id: "artifact_response_1",
    runId: "run_1",
    kind: "response",
    contentType: "application/json",
    storage: "inline",
    metadata: {},
    inlineData: {
      text: "Primary response"
    },
    createdAt: "2026-04-04T00:00:45.000Z"
  }
];

const summary = {
  eventCount: 1,
  checkpointCount: 1,
  pendingCheckpointCount: 1,
  delegationSessionCount: 2,
  pendingDelegationCount: 2,
  artifactCount: 2,
  memoryWriteCount: 1,
  childRunCount: 1
};

describe("RunTimelinePage", () => {
  it("renders operator summary cards, artifacts, claim metadata, memory writes, and child run navigation", () => {
    const markup = renderToStaticMarkup(
      createElement(RunTimelinePage, {
        run,
        events,
        checkpoints,
        memoryEntries,
        childRuns,
        delegationSessions,
        artifacts,
        summary,
        onReleaseDelegationSession: () => undefined,
        onSelectRun: () => undefined
      })
    );

    expect(markup).toContain("run_1");
    expect(markup).toContain("platform_geometry_standard");
    expect(markup).toContain("event count");
    expect(markup).toContain("artifact count");
    expect(markup).toContain("node.started");
    expect(markup).toContain("Confirm geometry draft");
    expect(markup).toContain("请确认是否继续执行。");
    expect(markup).toContain("teacher_preference");
    expect(markup).toContain("artifact_plan_1");
    expect(markup).toContain("artifact_response_1");
    expect(markup).toContain("Delegation Sessions");
    expect(markup).toContain("teacher_review");
    expect(markup).toContain("openclaw.geometry-reviewer");
    expect(markup).toContain("ACP Agent");
    expect(markup).toContain("executor_geometry_reviewer");
    expect(markup).toContain("2026-04-08T00:06:00.000Z");
    expect(markup).toContain("Force release claim");
    expect(markup).toContain("host_review");
    expect(markup).toContain("host.geometry-review");
    expect(markup).toContain("Host Service");
    expect(markup).toContain("Subagents");
    expect(markup).toContain("run_child_1");
    expect(markup).toContain("platform_geometry_quick_draft");
    expect(markup).toContain("data-run-id=\"run_child_1\"");
  });
});
