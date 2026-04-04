import type { Artifact, Checkpoint, Run, RunEvent } from "@geohelper/agent-protocol";

import type { ArtifactStoreState } from "../../state/artifact-store";
import type { CheckpointStoreState } from "../../state/checkpoint-store";
import type { RunStoreState } from "../../state/run-store";

const EMPTY_RUN_EVENTS: RunEvent[] = [];
const EMPTY_RUN_CHECKPOINTS: Checkpoint[] = [];
const EMPTY_RUN_ARTIFACTS: Artifact[] = [];

export const selectLatestRun = (state: RunStoreState): Run | null =>
  state.latestRunId ? state.runsById[state.latestRunId] ?? null : null;

export const selectLatestRunEvents = (state: RunStoreState): RunEvent[] =>
  state.latestRunId
    ? state.eventsByRunId[state.latestRunId] ?? EMPTY_RUN_EVENTS
    : EMPTY_RUN_EVENTS;

export const selectCheckpointsForRun = (
  state: CheckpointStoreState,
  runId: string | null
): Checkpoint[] =>
  runId ? state.checkpointsByRunId[runId] ?? EMPTY_RUN_CHECKPOINTS : EMPTY_RUN_CHECKPOINTS;

export const selectArtifactsForRun = (
  state: ArtifactStoreState,
  runId: string | null
): Artifact[] =>
  runId ? state.artifactsByRunId[runId] ?? EMPTY_RUN_ARTIFACTS : EMPTY_RUN_ARTIFACTS;
