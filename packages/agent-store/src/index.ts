import type {
  Artifact,
  Checkpoint,
  CheckpointStatus,
  MemoryEntry,
  Run,
  RunEvent
} from "@geohelper/agent-protocol";

import type { ArtifactRepo } from "./repos/artifact-repo";
import type { CheckpointRepo } from "./repos/checkpoint-repo";
import type { EventRepo } from "./repos/event-repo";
import type { MemoryRepo } from "./repos/memory-repo";
import type { AgentStoreResult, RunRepo, RunSnapshot } from "./repos/run-repo";

const bySequence = (left: RunEvent, right: RunEvent): number =>
  left.sequence - right.sequence;

const byCreatedAt = <T extends { createdAt: string }>(left: T, right: T): number =>
  left.createdAt.localeCompare(right.createdAt);

export interface AgentStore {
  runs: RunRepo;
  events: EventRepo;
  checkpoints: CheckpointRepo;
  artifacts: ArtifactRepo;
  memory: MemoryRepo;
  loadRunSnapshot: (runId: string) => AgentStoreResult<RunSnapshot | null>;
}

export const createMemoryAgentStore = (): AgentStore => {
  const runs = new Map<string, Run>();
  const eventsByRun = new Map<string, RunEvent[]>();
  const checkpointsByRun = new Map<string, Map<string, Checkpoint>>();
  const artifactsByRun = new Map<string, Map<string, Artifact>>();
  const memoryEntries = new Map<string, MemoryEntry>();

  const runRepo: RunRepo = {
    createRun: (run) => {
      runs.set(run.id, run);
    },
    getRun: (runId) => runs.get(runId) ?? null
  };

  const eventRepo: EventRepo = {
    appendRunEvent: (event) => {
      const next = [...(eventsByRun.get(event.runId) ?? []), event].sort(bySequence);
      eventsByRun.set(event.runId, next);
    },
    listRunEvents: (runId) => [...(eventsByRun.get(runId) ?? [])].sort(bySequence)
  };

  const checkpointRepo: CheckpointRepo = {
    upsertCheckpoint: (checkpoint) => {
      const next = new Map(checkpointsByRun.get(checkpoint.runId) ?? []);
      next.set(checkpoint.id, checkpoint);
      checkpointsByRun.set(checkpoint.runId, next);
    },
    listRunCheckpoints: (runId) =>
      [...(checkpointsByRun.get(runId)?.values() ?? [])].sort(byCreatedAt),
    listCheckpointsByStatus: (status: CheckpointStatus) =>
      [...checkpointsByRun.values()]
        .flatMap((items) => [...items.values()])
        .filter((item) => item.status === status)
        .sort(byCreatedAt)
  };

  const artifactRepo: ArtifactRepo = {
    writeArtifact: (artifact) => {
      const next = new Map(artifactsByRun.get(artifact.runId) ?? []);
      next.set(artifact.id, artifact);
      artifactsByRun.set(artifact.runId, next);
    },
    listRunArtifacts: (runId) =>
      [...(artifactsByRun.get(runId)?.values() ?? [])].sort(byCreatedAt)
  };

  const memoryRepo: MemoryRepo = {
    writeMemoryEntry: (entry) => {
      memoryEntries.set(entry.id, entry);
    },
    listMemoryEntriesForRun: (runId) =>
      [...memoryEntries.values()]
        .filter((entry) => entry.sourceRunId === runId)
        .sort(byCreatedAt)
  };

  return {
    runs: runRepo,
    events: eventRepo,
    checkpoints: checkpointRepo,
    artifacts: artifactRepo,
    memory: memoryRepo,
    loadRunSnapshot: async (runId) => {
      const run = await runRepo.getRun(runId);
      if (!run) {
        return null;
      }

      return {
        run,
        events: await eventRepo.listRunEvents(runId),
        checkpoints: await checkpointRepo.listRunCheckpoints(runId),
        artifacts: await artifactRepo.listRunArtifacts(runId),
        memoryEntries: await memoryRepo.listMemoryEntriesForRun(runId)
      };
    }
  };
};

export type * from "./repos/artifact-repo";
export type * from "./repos/checkpoint-repo";
export type * from "./repos/event-repo";
export type * from "./repos/memory-repo";
export type * from "./repos/run-repo";

export const packageName = "@geohelper/agent-store";
