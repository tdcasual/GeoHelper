import type { DelegationSessionRecord, RunSnapshot } from "@geohelper/agent-store";
import type { StoreApi } from "zustand/vanilla";

import { artifactStore } from "./artifact-store";
import type { ArtifactStoreState } from "./artifact-store";
import { checkpointStore } from "./checkpoint-store";
import type { CheckpointStoreState } from "./checkpoint-store";
import { delegationSessionStore } from "./delegation-session-store";
import type { DelegationSessionStoreState } from "./delegation-session-store";
import { runStore } from "./run-store";
import type { RunStoreState } from "./run-store";

export interface PlatformRunRecorderInput {
  snapshot: RunSnapshot;
  delegationSessions?: DelegationSessionRecord[];
}

interface PlatformRunRecorderDeps {
  runStore?: Pick<StoreApi<RunStoreState>, "getState">;
  checkpointStore?: Pick<StoreApi<CheckpointStoreState>, "getState">;
  artifactStore?: Pick<StoreApi<ArtifactStoreState>, "getState">;
  delegationSessionStore?: Pick<
    StoreApi<DelegationSessionStoreState>,
    "getState"
  >;
}

export const createPlatformRunRecorder = (
  {
    runStore: targetRunStore = runStore,
    checkpointStore: targetCheckpointStore = checkpointStore,
    artifactStore: targetArtifactStore = artifactStore,
    delegationSessionStore: targetDelegationSessionStore = delegationSessionStore
  }: PlatformRunRecorderDeps = {}
) => {
  return ({
    snapshot,
    delegationSessions = []
  }: PlatformRunRecorderInput): void => {
    targetRunStore.getState().applyStreamSnapshot(snapshot);
    targetCheckpointStore.getState().applyRunSnapshot(snapshot);
    targetArtifactStore.getState().applyRunSnapshot(snapshot);
    targetDelegationSessionStore.getState().applySessions(delegationSessions);
  };
};

export const recordPlatformRunSnapshot = createPlatformRunRecorder();
