import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  type Artifact,
  ArtifactSchema,
  type Checkpoint,
  CheckpointSchema,
  type CheckpointStatus,
  type MemoryEntry,
  MemoryEntrySchema,
  type Run,
  type RunEvent,
  RunEventSchema,
  RunSchema} from "@geohelper/agent-protocol";

import type { ArtifactRepo } from "./repos/artifact-repo";
import type { CheckpointRepo } from "./repos/checkpoint-repo";
import type { EventRepo } from "./repos/event-repo";
import type { MemoryEntryFilter, MemoryRepo } from "./repos/memory-repo";
import type {
  AgentStoreResult,
  RunRepo,
  RunSnapshot
} from "./repos/run-repo";

const SCHEMA_SQL = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

interface SqliteAgentStoreOptions {
  path: string;
}

interface SqliteAgentStore {
  runs: RunRepo;
  events: EventRepo;
  checkpoints: CheckpointRepo;
  artifacts: ArtifactRepo;
  memory: MemoryRepo;
  loadRunSnapshot: (runId: string) => AgentStoreResult<RunSnapshot | null>;
}

interface RunRow {
  id: string;
  thread_id: string;
  profile_id: string;
  status: Run["status"];
  parent_run_id: string | null;
  budget_json: string;
  input_artifact_ids_json: string;
  output_artifact_ids_json: string;
  created_at: string;
  updated_at: string;
}

interface RunEventRow {
  id: string;
  run_id: string;
  sequence: number;
  event_type: string;
  payload_json: string;
  created_at: string;
}

interface CheckpointRow {
  id: string;
  run_id: string;
  node_id: string;
  kind: Checkpoint["kind"];
  status: Checkpoint["status"];
  title: string;
  prompt: string;
  response_json: string | null;
  created_at: string;
  resolved_at: string | null;
}

interface ArtifactRow {
  id: string;
  run_id: string;
  kind: Artifact["kind"];
  content_type: string;
  storage: Artifact["storage"];
  inline_data_json: string | null;
  blob_uri: string | null;
  metadata_json: string;
  created_at: string;
}

interface MemoryEntryRow {
  id: string;
  scope: MemoryEntry["scope"];
  scope_id: string;
  key: string;
  value_json: string;
  source_run_id: string | null;
  source_artifact_id: string | null;
  created_at: string;
}

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) {
    return fallback;
  }

  return JSON.parse(value) as T;
};

const readRows = <TRow>(rows: unknown): TRow[] => rows as TRow[];

const mapRunRow = (row: RunRow): Run =>
  RunSchema.parse({
    id: row.id,
    threadId: row.thread_id,
    profileId: row.profile_id,
    status: row.status,
    parentRunId: row.parent_run_id ?? undefined,
    budget: parseJson(row.budget_json, {}),
    inputArtifactIds: parseJson(row.input_artifact_ids_json, []),
    outputArtifactIds: parseJson(row.output_artifact_ids_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });

const mapRunEventRow = (row: RunEventRow): RunEvent =>
  RunEventSchema.parse({
    id: row.id,
    runId: row.run_id,
    sequence: row.sequence,
    type: row.event_type,
    payload: parseJson(row.payload_json, {}),
    createdAt: row.created_at
  });

const mapCheckpointRow = (row: CheckpointRow): Checkpoint =>
  CheckpointSchema.parse({
    id: row.id,
    runId: row.run_id,
    nodeId: row.node_id,
    kind: row.kind,
    status: row.status,
    title: row.title,
    prompt: row.prompt,
    response: parseJson(row.response_json, undefined),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined
  });

const mapArtifactRow = (row: ArtifactRow): Artifact =>
  ArtifactSchema.parse({
    id: row.id,
    runId: row.run_id,
    kind: row.kind,
    contentType: row.content_type,
    storage: row.storage,
    inlineData: parseJson(row.inline_data_json, undefined),
    blobUri: row.blob_uri ?? undefined,
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at
  });

const mapMemoryEntryRow = (row: MemoryEntryRow): MemoryEntry =>
  MemoryEntrySchema.parse({
    id: row.id,
    scope: row.scope,
    scopeId: row.scope_id,
    key: row.key,
    value: parseJson(row.value_json, null),
    sourceRunId: row.source_run_id ?? undefined,
    sourceArtifactId: row.source_artifact_id ?? undefined,
    createdAt: row.created_at
  });

const matchesMemoryFilter = (
  entry: MemoryEntry,
  filter: MemoryEntryFilter = {}
): boolean => {
  if (filter.scope && entry.scope !== filter.scope) {
    return false;
  }

  if (filter.scopeId && entry.scopeId !== filter.scopeId) {
    return false;
  }

  if (filter.key && entry.key !== filter.key) {
    return false;
  }

  if (filter.sourceRunId && entry.sourceRunId !== filter.sourceRunId) {
    return false;
  }

  if (
    filter.sourceArtifactId &&
    entry.sourceArtifactId !== filter.sourceArtifactId
  ) {
    return false;
  }

  return true;
};

export const createSqliteAgentStore = ({
  path
}: SqliteAgentStoreOptions): SqliteAgentStore => {
  const database = new DatabaseSync(path);
  database.exec("pragma foreign_keys = on;");
  database.exec(SCHEMA_SQL);

  const upsertRunStatement = database.prepare(`
    insert into runs (
      id,
      thread_id,
      profile_id,
      status,
      parent_run_id,
      budget_json,
      input_artifact_ids_json,
      output_artifact_ids_json,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      thread_id = excluded.thread_id,
      profile_id = excluded.profile_id,
      status = excluded.status,
      parent_run_id = excluded.parent_run_id,
      budget_json = excluded.budget_json,
      input_artifact_ids_json = excluded.input_artifact_ids_json,
      output_artifact_ids_json = excluded.output_artifact_ids_json,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `);
  const getRunStatement = database.prepare(`
    select
      id,
      thread_id,
      profile_id,
      status,
      parent_run_id,
      budget_json,
      input_artifact_ids_json,
      output_artifact_ids_json,
      created_at,
      updated_at
    from runs
    where id = ?
  `);
  const listRunsStatement = database.prepare(`
    select
      id,
      thread_id,
      profile_id,
      status,
      parent_run_id,
      budget_json,
      input_artifact_ids_json,
      output_artifact_ids_json,
      created_at,
      updated_at
    from runs
    order by created_at asc
  `);
  const listRunsByStatusStatement = database.prepare(`
    select
      id,
      thread_id,
      profile_id,
      status,
      parent_run_id,
      budget_json,
      input_artifact_ids_json,
      output_artifact_ids_json,
      created_at,
      updated_at
    from runs
    where status = ?
    order by created_at asc
  `);

  const appendRunEventStatement = database.prepare(`
    insert into run_events (
      id,
      run_id,
      sequence,
      event_type,
      payload_json,
      created_at
    ) values (?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      run_id = excluded.run_id,
      sequence = excluded.sequence,
      event_type = excluded.event_type,
      payload_json = excluded.payload_json,
      created_at = excluded.created_at
  `);
  const listRunEventsStatement = database.prepare(`
    select
      id,
      run_id,
      sequence,
      event_type,
      payload_json,
      created_at
    from run_events
    where run_id = ?
    order by sequence asc
  `);

  const upsertCheckpointStatement = database.prepare(`
    insert into checkpoints (
      id,
      run_id,
      node_id,
      kind,
      status,
      title,
      prompt,
      response_json,
      created_at,
      resolved_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      run_id = excluded.run_id,
      node_id = excluded.node_id,
      kind = excluded.kind,
      status = excluded.status,
      title = excluded.title,
      prompt = excluded.prompt,
      response_json = excluded.response_json,
      created_at = excluded.created_at,
      resolved_at = excluded.resolved_at
  `);
  const listRunCheckpointsStatement = database.prepare(`
    select
      id,
      run_id,
      node_id,
      kind,
      status,
      title,
      prompt,
      response_json,
      created_at,
      resolved_at
    from checkpoints
    where run_id = ?
    order by created_at asc
  `);
  const listCheckpointsByStatusStatement = database.prepare(`
    select
      id,
      run_id,
      node_id,
      kind,
      status,
      title,
      prompt,
      response_json,
      created_at,
      resolved_at
    from checkpoints
    where status = ?
    order by created_at asc
  `);

  const writeArtifactStatement = database.prepare(`
    insert into artifacts (
      id,
      run_id,
      kind,
      content_type,
      storage,
      inline_data_json,
      blob_uri,
      metadata_json,
      created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      run_id = excluded.run_id,
      kind = excluded.kind,
      content_type = excluded.content_type,
      storage = excluded.storage,
      inline_data_json = excluded.inline_data_json,
      blob_uri = excluded.blob_uri,
      metadata_json = excluded.metadata_json,
      created_at = excluded.created_at
  `);
  const listRunArtifactsStatement = database.prepare(`
    select
      id,
      run_id,
      kind,
      content_type,
      storage,
      inline_data_json,
      blob_uri,
      metadata_json,
      created_at
    from artifacts
    where run_id = ?
    order by created_at asc
  `);

  const writeMemoryEntryStatement = database.prepare(`
    insert into memory_entries (
      id,
      scope,
      scope_id,
      key,
      value_json,
      source_run_id,
      source_artifact_id,
      created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      scope = excluded.scope,
      scope_id = excluded.scope_id,
      key = excluded.key,
      value_json = excluded.value_json,
      source_run_id = excluded.source_run_id,
      source_artifact_id = excluded.source_artifact_id,
      created_at = excluded.created_at
  `);
  const listMemoryEntriesStatement = database.prepare(`
    select
      id,
      scope,
      scope_id,
      key,
      value_json,
      source_run_id,
      source_artifact_id,
      created_at
    from memory_entries
    order by created_at asc
  `);

  const runRepo: RunRepo = {
    createRun: (run) => {
      upsertRunStatement.run(
        run.id,
        run.threadId,
        run.profileId,
        run.status,
        run.parentRunId ?? null,
        JSON.stringify(run.budget),
        JSON.stringify(run.inputArtifactIds),
        JSON.stringify(run.outputArtifactIds),
        run.createdAt,
        run.updatedAt
      );
    },
    getRun: (runId) => {
      const row = getRunStatement.get(runId) as RunRow | undefined;

      return row ? mapRunRow(row) : null;
    },
    listRuns: (filter = {}) => {
      const rows = readRows<RunRow>(
        filter.status
          ? listRunsByStatusStatement.all(filter.status)
          : listRunsStatement.all()
      );

      return rows.map(mapRunRow);
    }
  };

  const eventRepo: EventRepo = {
    appendRunEvent: (event) => {
      appendRunEventStatement.run(
        event.id,
        event.runId,
        event.sequence,
        event.type,
        JSON.stringify(event.payload),
        event.createdAt
      );
    },
    listRunEvents: (runId) =>
      readRows<RunEventRow>(listRunEventsStatement.all(runId)).map(mapRunEventRow)
  };

  const checkpointRepo: CheckpointRepo = {
    upsertCheckpoint: (checkpoint) => {
      upsertCheckpointStatement.run(
        checkpoint.id,
        checkpoint.runId,
        checkpoint.nodeId,
        checkpoint.kind,
        checkpoint.status,
        checkpoint.title,
        checkpoint.prompt,
        checkpoint.response === undefined
          ? null
          : JSON.stringify(checkpoint.response),
        checkpoint.createdAt,
        checkpoint.resolvedAt ?? null
      );
    },
    listRunCheckpoints: (runId) =>
      readRows<CheckpointRow>(listRunCheckpointsStatement.all(runId)).map(
        mapCheckpointRow
      ),
    listCheckpointsByStatus: (status: CheckpointStatus) =>
      readRows<CheckpointRow>(listCheckpointsByStatusStatement.all(status)).map(
        mapCheckpointRow
      )
  };

  const artifactRepo: ArtifactRepo = {
    writeArtifact: (artifact) => {
      writeArtifactStatement.run(
        artifact.id,
        artifact.runId,
        artifact.kind,
        artifact.contentType,
        artifact.storage,
        artifact.inlineData === undefined
          ? null
          : JSON.stringify(artifact.inlineData),
        artifact.blobUri ?? null,
        JSON.stringify(artifact.metadata),
        artifact.createdAt
      );
    },
    listRunArtifacts: (runId) =>
      readRows<ArtifactRow>(listRunArtifactsStatement.all(runId)).map(
        mapArtifactRow
      )
  };

  const listMemoryEntries = (
    filter: MemoryEntryFilter = {}
  ): AgentStoreResult<MemoryEntry[]> =>
    readRows<MemoryEntryRow>(listMemoryEntriesStatement.all())
      .map(mapMemoryEntryRow)
      .filter((entry) => matchesMemoryFilter(entry, filter));

  const memoryRepo: MemoryRepo = {
    writeMemoryEntry: (entry) => {
      writeMemoryEntryStatement.run(
        entry.id,
        entry.scope,
        entry.scopeId,
        entry.key,
        JSON.stringify(entry.value),
        entry.sourceRunId ?? null,
        entry.sourceArtifactId ?? null,
        entry.createdAt
      );
    },
    listMemoryEntries,
    listMemoryEntriesForRun: (runId) => listMemoryEntries({ sourceRunId: runId })
  };

  return {
    runs: runRepo,
    events: eventRepo,
    checkpoints: checkpointRepo,
    artifacts: artifactRepo,
    memory: memoryRepo,
    loadRunSnapshot: async (runId): Promise<RunSnapshot | null> => {
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
