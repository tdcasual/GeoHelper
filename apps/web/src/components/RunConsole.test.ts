import type {
  Artifact,
  Checkpoint,
  Run,
  RunEvent
} from "@geohelper/agent-protocol";
import type { DelegationSessionRecord } from "@geohelper/agent-store";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RunConsole } from "./RunConsole";

const run: Run = {
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
  updatedAt: "2026-04-04T00:00:00.000Z"
};

const events: RunEvent[] = [
  {
    id: "event_1",
    runId: "run_1",
    sequence: 1,
    type: "run.created",
    payload: {},
    createdAt: "2026-04-04T00:00:00.000Z"
  }
];

const pendingCheckpoint: Checkpoint = {
  id: "checkpoint_1",
  runId: "run_1",
  nodeId: "node_teacher_checkpoint",
  kind: "human_input",
  status: "pending",
  title: "Confirm geometry draft",
  prompt: "请确认是否继续执行。",
  createdAt: "2026-04-04T00:00:00.000Z"
};

const resolvedCheckpoint: Checkpoint = {
  ...pendingCheckpoint,
  status: "resolved",
  response: {
    approved: true
  },
  resolvedAt: "2026-04-04T00:01:00.000Z"
};

const artifacts: Artifact[] = [
  {
    id: "artifact_draft_1",
    runId: "run_1",
    kind: "draft",
    contentType: "application/json",
    storage: "inline",
    metadata: {},
    inlineData: {
      title: "初版草案"
    },
    createdAt: "2026-04-04T00:00:00.000Z"
  },
  {
    id: "artifact_canvas_1",
    runId: "run_1",
    kind: "canvas_evidence",
    contentType: "application/json",
    storage: "inline",
    metadata: {},
    inlineData: {
      snapshot: "scene_1"
    },
    createdAt: "2026-04-04T00:00:30.000Z"
  },
  {
    id: "artifact_draft_2",
    runId: "run_1",
    kind: "draft",
    contentType: "application/json",
    storage: "inline",
    metadata: {},
    inlineData: {
      title: "修正版草案"
    },
    createdAt: "2026-04-04T00:01:00.000Z"
  }
];

const childRuns: Run[] = [
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

describe("RunConsole", () => {
  it("shows an inspector entrypoint and renders the current run inspector detail when opened", () => {
    const pendingMarkup = renderToStaticMarkup(
      createElement(RunConsole, {
        run,
        events,
        checkpoints: [pendingCheckpoint],
        artifacts,
        childRuns,
        delegationSessions,
        defaultInspectorOpen: true
      })
    );
    const resolvedMarkup = renderToStaticMarkup(
      createElement(RunConsole, {
        run: {
          ...run,
          status: "completed"
        },
        events: [
          ...events,
          {
            id: "event_2",
            runId: "run_1",
            sequence: 2,
            type: "checkpoint.resolved",
            payload: {},
            createdAt: "2026-04-04T00:01:00.000Z"
          }
        ],
        checkpoints: [resolvedCheckpoint],
        artifacts,
        childRuns,
        delegationSessions: [
          {
            ...delegationSessions[0],
            status: "completed",
            outputArtifactIds: ["artifact_acp_1"]
          }
        ],
        defaultInspectorOpen: true
      })
    );

    expect(pendingMarkup).toContain("Inspect run");
    expect(pendingMarkup).toContain("Admin Run Inspector");
    expect(pendingMarkup).toContain("Confirm geometry draft");
    expect(pendingMarkup).toContain("platform_geometry_standard");
    expect(pendingMarkup).toContain("event count");
    expect(pendingMarkup).toContain("artifact count");
    expect(resolvedMarkup).toContain("暂无待处理 checkpoint");
    expect(resolvedMarkup).toContain("修正版草案");
    expect(resolvedMarkup).toContain("scene_1");
    expect(pendingMarkup).toContain("Delegation Sessions");
    expect(pendingMarkup).toContain("teacher_review");
    expect(pendingMarkup).toContain("openclaw.geometry-reviewer");
    expect(pendingMarkup).toContain("ACP Agent");
    expect(pendingMarkup).toContain("host_review");
    expect(pendingMarkup).toContain("host.geometry-review");
    expect(pendingMarkup).toContain("Host Service");
    expect(resolvedMarkup).toContain("completed");
    expect(resolvedMarkup).toContain("Subagents");
    expect(resolvedMarkup).toContain("run_child_1");
    expect(resolvedMarkup).toContain("platform_geometry_quick_draft");
    expect(resolvedMarkup).toContain("data-run-id=\"run_child_1\"");
  });
});
