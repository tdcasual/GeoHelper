import type { Artifact } from "@geohelper/agent-protocol";

import type { AgentStoreResult } from "./run-repo";

export interface ArtifactRepo {
  writeArtifact: (artifact: Artifact) => AgentStoreResult<void>;
  getArtifact: (artifactId: string) => AgentStoreResult<Artifact | null>;
  listRunArtifacts: (runId: string) => AgentStoreResult<Artifact[]>;
}
