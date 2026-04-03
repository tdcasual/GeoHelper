import type { Checkpoint, CheckpointStatus } from "@geohelper/agent-protocol";

import type { AgentStoreResult } from "./run-repo";

export interface CheckpointRepo {
  upsertCheckpoint: (checkpoint: Checkpoint) => AgentStoreResult<void>;
  listRunCheckpoints: (runId: string) => AgentStoreResult<Checkpoint[]>;
  listCheckpointsByStatus: (
    status: CheckpointStatus
  ) => AgentStoreResult<Checkpoint[]>;
}
