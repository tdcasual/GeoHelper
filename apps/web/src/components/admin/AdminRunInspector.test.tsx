import type { Artifact, MemoryEntry, Run, RunEvent } from "@geohelper/agent-protocol";
import type { DelegationSessionRecord } from "@geohelper/agent-store";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AdminRunInspector } from "./AdminRunInspector";

const runs: Run[] = [
  {
    id: "run_1",
    threadId: "thread_1",
    profileId: "platform_geometry_standard",
    status: "waiting_for_checkpoint",
    inputArtifactIds: [],
    outputArtifactIds: ["artifact_response_1"],
    budget: {
      maxModelCalls: 6,
      maxToolCalls: 8,
      maxDurationMs: 120000
    },
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:01:00.000Z"
  },
  {
    id: "run_2",
    threadId: "thread_1",
    profileId: "platform_geometry_quick_draft",
    status: "completed",
    inputArtifactIds: [],
    outputArtifactIds: [],
    budget: {
      maxModelCalls: 3,
      maxToolCalls: 4,
      maxDurationMs: 60000
    },
    createdAt: "2026-04-10T00:02:00.000Z",
    updatedAt: "2026-04-10T00:03:00.000Z"
  }
];

const events: RunEvent[] = [
  {
    id: "event_1",
    runId: "run_1",
    sequence: 1,
    type: "node.started",
    payload: {
      nodeId: "node_plan_geometry"
    },
    createdAt: "2026-04-10T00:00:00.000Z"
  }
];

const artifacts: Artifact[] = [
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
    createdAt: "2026-04-10T00:00:10.000Z"
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
    sourceArtifactId: "artifact_response_1",
    createdAt: "2026-04-10T00:00:12.000Z"
  }
];

const delegationSessions: DelegationSessionRecord[] = [
  {
    id: "delegation_session_1",
    runId: "run_1",
    checkpointId: "checkpoint_1",
    delegationName: "teacher_review",
    agentRef: "openclaw.geometry-reviewer",
    status: "pending",
    outputArtifactIds: [],
    claimedBy: "executor_geometry_reviewer",
    claimExpiresAt: "2026-04-10T00:05:00.000Z",
    createdAt: "2026-04-10T00:00:20.000Z",
    updatedAt: "2026-04-10T00:00:20.000Z"
  }
];

describe("AdminRunInspector", () => {
  it("renders a run list and the selected run timeline detail panel", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminRunInspector, {
        runs,
        selectedRunId: "run_1",
        selectedTimeline: {
          run: runs[0],
          events,
          childRuns: [runs[1]],
          checkpoints: [],
          delegationSessions,
          artifacts,
          summary: {
            eventCount: 1,
            checkpointCount: 0,
            pendingCheckpointCount: 0,
            delegationSessionCount: 1,
            pendingDelegationCount: 1,
            artifactCount: 1,
            memoryWriteCount: 1,
            childRunCount: 1
          },
          memoryEntries
        },
        loadingRuns: false,
        loadingTimeline: false,
        onReleaseDelegationSession: vi.fn(),
        onSelectRun: vi.fn()
      })
    );

    expect(markup).toContain("Admin Run Inspector");
    expect(markup).toContain("run_1");
    expect(markup).toContain("run_2");
    expect(markup).toContain("artifact_response_1");
    expect(markup).toContain("teacher_preference");
    expect(markup).toContain("executor_geometry_reviewer");
    expect(markup).toContain("Force release claim");
    expect(markup).toContain("data-run-id=\"run_2\"");
  });
});
