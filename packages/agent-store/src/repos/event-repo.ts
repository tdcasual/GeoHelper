import type { RunEvent } from "@geohelper/agent-protocol";

import type { AgentStoreResult } from "./run-repo";

export interface EventRepo {
  appendRunEvent: (event: RunEvent) => AgentStoreResult<void>;
  listRunEvents: (runId: string) => AgentStoreResult<RunEvent[]>;
}
