import { describe, expect, it } from "vitest";

import {
  selectArtifactsForRun,
  selectCheckpointsForRun,
  selectLatestRun,
  selectLatestRunEvents
} from "../../apps/web/src/components/workspace-shell/platform-run-selectors";
import type { ArtifactStoreState } from "../../apps/web/src/state/artifact-store";
import type { CheckpointStoreState } from "../../apps/web/src/state/checkpoint-store";
import type { RunStoreState } from "../../apps/web/src/state/run-store";
import type { Artifact, Checkpoint, Run, RunEvent } from "../../packages/agent-protocol/src";

const createRunState = (overrides: Partial<RunStoreState> = {}): RunStoreState => ({
  runsById: {},
  eventsByRunId: {},
  latestRunId: null,
  upsertRun: () => undefined,
  applyStreamSnapshot: () => undefined,
  clear: () => undefined,
  ...overrides
});

const createCheckpointState = (
  overrides: Partial<CheckpointStoreState> = {}
): CheckpointStoreState => ({
  checkpointsById: {},
  checkpointsByRunId: {},
  applyRunSnapshot: () => undefined,
  clear: () => undefined,
  ...overrides
});

const createArtifactState = (
  overrides: Partial<ArtifactStoreState> = {}
): ArtifactStoreState => ({
  artifactsById: {},
  artifactsByRunId: {},
  applyRunSnapshot: () => undefined,
  clear: () => undefined,
  ...overrides
});

describe("platform run selectors", () => {
  it("returns stable empty snapshots before the first run arrives", () => {
    const runState = createRunState();
    const checkpointState = createCheckpointState();
    const artifactState = createArtifactState();

    expect(selectLatestRun(runState)).toBeNull();
    expect(selectLatestRunEvents(runState)).toBe(selectLatestRunEvents(runState));
    expect(selectCheckpointsForRun(checkpointState, null)).toBe(
      selectCheckpointsForRun(checkpointState, null)
    );
    expect(selectArtifactsForRun(artifactState, null)).toBe(
      selectArtifactsForRun(artifactState, null)
    );
  });

  it("resolves the latest run snapshot when a run id exists", () => {
    const run: Run = {
      id: "run_1",
      threadId: "thread_1",
      workflowId: "wf_geometry_solver",
      agentId: "geometry_solver",
      status: "completed",
      inputArtifactIds: [],
      outputArtifactIds: [],
      budget: {
        maxModelCalls: 4,
        maxToolCalls: 6,
        maxDurationMs: 60_000
      },
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:00:05.000Z"
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
    const checkpoints: Checkpoint[] = [
      {
        id: "checkpoint_1",
        runId: "run_1",
        nodeId: "node_teacher_checkpoint",
        kind: "human_input",
        status: "pending",
        title: "Confirm draft",
        prompt: "Continue?",
        createdAt: "2026-04-04T00:00:05.000Z"
      }
    ];
    const artifacts: Artifact[] = [
      {
        id: "artifact_1",
        runId: "run_1",
        kind: "draft",
        contentType: "application/json",
        storage: "inline",
        metadata: {},
        inlineData: {
          title: "draft"
        },
        createdAt: "2026-04-04T00:00:04.000Z"
      }
    ];

    expect(
      selectLatestRun(
        createRunState({
          runsById: {
            [run.id]: run
          },
          eventsByRunId: {
            [run.id]: events
          },
          latestRunId: run.id
        })
      )
    ).toEqual(run);
    expect(
      selectLatestRunEvents(
        createRunState({
          eventsByRunId: {
            [run.id]: events
          },
          latestRunId: run.id
        })
      )
    ).toEqual(events);
    expect(
      selectCheckpointsForRun(
        createCheckpointState({
          checkpointsByRunId: {
            [run.id]: checkpoints
          }
        }),
        run.id
      )
    ).toEqual(checkpoints);
    expect(
      selectArtifactsForRun(
        createArtifactState({
          artifactsByRunId: {
            [run.id]: artifacts
          }
        }),
        run.id
      )
    ).toEqual(artifacts);
  });
});
