import type { Artifact } from "@geohelper/agent-protocol";

import type { AgentStoreResult } from "./run-repo";

export interface ArtifactRepo {
  writeArtifact: (artifact: Artifact) => AgentStoreResult<void>;
  listRunArtifacts: (runId: string) => AgentStoreResult<Artifact[]>;
}
