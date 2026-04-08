import type { Artifact, Checkpoint, Run, RunEvent } from "@geohelper/agent-protocol";
import type { AcpSessionRecord, RunSnapshot } from "@geohelper/agent-store";

import type { RuntimeRunResponse } from "../runtime/types";

interface PlatformRunFixtureOverride {
  run?: Partial<RunSnapshot["run"]>;
  events?: RunEvent[];
  checkpoints?: Checkpoint[];
  artifacts?: Artifact[];
  childRuns?: Run[];
  acpSessions?: AcpSessionRecord[];
}

export const createRunSnapshotFixture = (
  override: PlatformRunFixtureOverride = {}
): RunSnapshot => ({
  run: {
    id: "run_fixture",
    threadId: "thread_fixture",
    profileId: "platform_geometry_standard",
    status: "completed",
    inputArtifactIds: [],
    outputArtifactIds: ["artifact_response_fixture"],
    budget: {
      maxModelCalls: 6,
      maxToolCalls: 8,
      maxDurationMs: 120000
    },
    createdAt: "2026-04-04T00:00:00.000Z",
    updatedAt: "2026-04-04T00:00:05.000Z",
    ...override.run
  },
  events:
    override.events ??
    [
      {
        id: "event_1",
        runId: override.run?.id ?? "run_fixture",
        sequence: 1,
        type: "run.created",
        payload: {},
        createdAt: "2026-04-04T00:00:00.000Z"
      },
      {
        id: "event_2",
        runId: override.run?.id ?? "run_fixture",
        sequence: 2,
        type: "node.completed",
        payload: {
          nodeId: "node_plan_geometry",
          resultType: "continue",
          durationMs: 12
        },
        createdAt: "2026-04-04T00:00:01.000Z"
      },
      {
        id: "event_3",
        runId: override.run?.id ?? "run_fixture",
        sequence: 3,
        type: "run.completed",
        payload: {},
        createdAt: "2026-04-04T00:00:05.000Z"
      }
    ],
  checkpoints: override.checkpoints ?? [],
  artifacts:
    override.artifacts ??
    [
      {
        id: "artifact_response_fixture",
        runId: override.run?.id ?? "run_fixture",
        kind: "response",
        contentType: "application/json",
        storage: "inline",
        metadata: {},
        inlineData: {
          title: "几何解题结果",
          summary: ["已创建三角形 ABC", "已标出角平分线 AD"]
        },
        createdAt: "2026-04-04T00:00:04.000Z"
      },
      {
        id: "artifact_tool_fixture",
        runId: override.run?.id ?? "run_fixture",
        kind: "tool_result",
        contentType: "application/json",
        storage: "inline",
        metadata: {
          commandCount: 2
        },
        inlineData: {
          commandBatch: {
            commands: [{ id: "cmd_1" }, { id: "cmd_2" }]
          }
        },
        createdAt: "2026-04-04T00:00:03.000Z"
      }
    ],
  childRuns: override.childRuns ?? [],
  memoryEntries: []
});

export const createRuntimeRunResponseFixture = (
  override: PlatformRunFixtureOverride = {}
): RuntimeRunResponse => ({
  trace_id: override.run?.id ?? "run_fixture",
  run_snapshot: createRunSnapshotFixture(override),
  acpSessions: override.acpSessions ?? []
});
