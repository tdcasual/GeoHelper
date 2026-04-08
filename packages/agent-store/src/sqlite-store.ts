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

import type {
  AcpSessionRecord,
  AcpSessionRepo
} from "./repos/acp-session-repo";
import type { ArtifactRepo } from "./repos/artifact-repo";
import type {
  BrowserSessionRecord,
  BrowserSessionRepo
} from "./repos/browser-session-repo";
import type { CheckpointRepo } from "./repos/checkpoint-repo";
import type {
  ClaimNextDispatchInput,
  DispatchRepo
} from "./repos/dispatch-repo";
import type {
  EngineStateRepo,
  WorkflowBudgetUsageState,
  WorkflowEngineStateRecord
} from "./repos/engine-state-repo";
import type { EventRepo } from "./repos/event-repo";
import type { MemoryEntryFilter, MemoryRepo } from "./repos/memory-repo";
import type {
  AgentStoreResult,
  RunFilter,
  RunRepo,
  RunSnapshot
} from "./repos/run-repo";
import type { AgentThread, ThreadRepo } from "./repos/thread-repo";

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
  dispatches: DispatchRepo;
  engineStates: EngineStateRepo;
  threads: ThreadRepo;
  acpSessions: AcpSessionRepo;
  browserSessions: BrowserSessionRepo;
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
  metadata_json: string;
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

interface RunDispatchRow {
  id: string;
  run_id: string;
  worker_id: string | null;
  created_at: string;
  claimed_at: string | null;
}

interface WorkflowEngineStateRow {
  run_id: string;
  next_node_id: string | null;
  visited_node_ids_json: string;
  emitted_event_count: number;
  spawned_run_ids_json: string;
  budget_usage_json: string;
  pending_checkpoint_id: string | null;
  pending_child_run_id: string | null;
  updated_at: string;
}

interface TableInfoRow {
  name: string;
  notnull: number;
}

interface ThreadRow {
  id: string;
  title: string;
  created_at: string;
}

interface BrowserSessionRow {
  id: string;
  run_id: string;
  allowed_tool_names_json: string;
  created_at: string;
}

interface AcpSessionRow {
  id: string;
  run_id: string;
  checkpoint_id: string;
  delegation_name: string;
  agent_ref: string;
  service_ref: string | null;
  status: AcpSessionRecord["status"];
  output_artifact_ids_json: string;
  result_json: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) {
    return fallback;
  }

  return JSON.parse(value) as T;
};

const readRows = <TRow>(rows: unknown): TRow[] => rows as TRow[];

const matchesRunFilter = (run: Run, filter: RunFilter = {}): boolean => {
  if (filter.status && run.status !== filter.status) {
    return false;
  }

  if (filter.parentRunId && run.parentRunId !== filter.parentRunId) {
    return false;
  }

  return true;
};

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
    metadata: parseJson(row.metadata_json, {}),
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

const mapRunDispatchRow = (row: RunDispatchRow) => ({
  id: row.id,
  runId: row.run_id,
  workerId: row.worker_id ?? undefined,
  createdAt: row.created_at,
  claimedAt: row.claimed_at ?? undefined
});

const mapWorkflowEngineStateRow = (
  row: WorkflowEngineStateRow
): WorkflowEngineStateRecord => ({
  runId: row.run_id,
  nextNodeId: row.next_node_id,
  visitedNodeIds: parseJson(row.visited_node_ids_json, []),
  emittedEventCount: row.emitted_event_count,
  spawnedRunIds: parseJson(row.spawned_run_ids_json, []),
  budgetUsage: parseJson<WorkflowBudgetUsageState>(row.budget_usage_json, {
    modelCalls: 0,
    toolCalls: 0
  }),
  pendingCheckpointId: row.pending_checkpoint_id ?? undefined,
  pendingChildRunId: row.pending_child_run_id ?? undefined,
  updatedAt: row.updated_at
});

const ensureWorkflowEngineStateSchema = (database: DatabaseSync): void => {
  const columns = readRows<TableInfoRow>(
    database.prepare("pragma table_info(workflow_engine_states)").all()
  );
  const pendingCheckpointColumn = columns.find(
    (column) => column.name === "pending_checkpoint_id"
  );
  const hasPendingChildColumn = columns.some(
    (column) => column.name === "pending_child_run_id"
  );

  if (hasPendingChildColumn && pendingCheckpointColumn?.notnull !== 1) {
    return;
  }

  database.exec("pragma foreign_keys = off;");

  try {
    database.exec(`
      alter table workflow_engine_states
      rename to workflow_engine_states_legacy;

      create table workflow_engine_states (
        run_id text primary key,
        next_node_id text,
        visited_node_ids_json text not null,
        emitted_event_count integer not null,
        spawned_run_ids_json text not null,
        budget_usage_json text not null,
        pending_checkpoint_id text,
        pending_child_run_id text,
        updated_at text not null,
        foreign key (run_id) references runs(id) on delete cascade,
        foreign key (pending_checkpoint_id) references checkpoints(id) on delete cascade,
        foreign key (pending_child_run_id) references runs(id) on delete cascade
      );

      insert into workflow_engine_states (
        run_id,
        next_node_id,
        visited_node_ids_json,
        emitted_event_count,
        spawned_run_ids_json,
        budget_usage_json,
        pending_checkpoint_id,
        pending_child_run_id,
        updated_at
      )
      select
        run_id,
        next_node_id,
        visited_node_ids_json,
        emitted_event_count,
        spawned_run_ids_json,
        budget_usage_json,
        pending_checkpoint_id,
        null,
        updated_at
      from workflow_engine_states_legacy;

      drop table workflow_engine_states_legacy;
    `);
  } finally {
    database.exec("pragma foreign_keys = on;");
  }
};

const ensureCheckpointMetadataSchema = (database: DatabaseSync): void => {
  const columns = readRows<TableInfoRow>(
    database.prepare("pragma table_info(checkpoints)").all()
  );

  if (columns.some((column) => column.name === "metadata_json")) {
    return;
  }

  database.exec(`
    alter table checkpoints
    add column metadata_json text not null default '{}'
  `);
};

const ensureAcpSessionClaimSchema = (database: DatabaseSync): void => {
  const columns = readRows<TableInfoRow>(
    database.prepare("pragma table_info(acp_sessions)").all()
  );

  if (!columns.some((column) => column.name === "claimed_by")) {
    database.exec(`
      alter table acp_sessions
      add column claimed_by text
    `);
  }

  if (!columns.some((column) => column.name === "claimed_at")) {
    database.exec(`
      alter table acp_sessions
      add column claimed_at text
    `);
  }

  if (!columns.some((column) => column.name === "claim_expires_at")) {
    database.exec(`
      alter table acp_sessions
      add column claim_expires_at text
    `);
  }
};

const mapThreadRow = (row: ThreadRow): AgentThread => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at
});

const mapBrowserSessionRow = (
  row: BrowserSessionRow
): BrowserSessionRecord => ({
  id: row.id,
  runId: row.run_id,
  allowedToolNames: parseJson(row.allowed_tool_names_json, []),
  createdAt: row.created_at
});

const mapAcpSessionRow = (row: AcpSessionRow): AcpSessionRecord => ({
  id: row.id,
  runId: row.run_id,
  checkpointId: row.checkpoint_id,
  delegationName: row.delegation_name,
  agentRef: row.agent_ref,
  serviceRef: row.service_ref ?? undefined,
  status: row.status,
  outputArtifactIds: parseJson(row.output_artifact_ids_json, []),
  result: parseJson(row.result_json, undefined),
  claimedBy: row.claimed_by ?? undefined,
  claimedAt: row.claimed_at ?? undefined,
  claimExpiresAt: row.claim_expires_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  resolvedAt: row.resolved_at ?? undefined
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
  ensureCheckpointMetadataSchema(database);
  ensureWorkflowEngineStateSchema(database);
  ensureAcpSessionClaimSchema(database);

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
  const upsertThreadStatement = database.prepare(`
    insert into threads (
      id,
      title,
      created_at
    ) values (?, ?, ?)
    on conflict(id) do update set
      title = excluded.title,
      created_at = excluded.created_at
  `);
  const getThreadStatement = database.prepare(`
    select
      id,
      title,
      created_at
    from threads
    where id = ?
  `);
  const listThreadsStatement = database.prepare(`
    select
      id,
      title,
      created_at
    from threads
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
      metadata_json,
      response_json,
      created_at,
      resolved_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      run_id = excluded.run_id,
      node_id = excluded.node_id,
      kind = excluded.kind,
      status = excluded.status,
      title = excluded.title,
      prompt = excluded.prompt,
      metadata_json = excluded.metadata_json,
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
      metadata_json,
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
      metadata_json,
      response_json,
      created_at,
      resolved_at
    from checkpoints
    where status = ?
    order by created_at asc
  `);
  const getCheckpointStatement = database.prepare(`
    select
      id,
      run_id,
      node_id,
      kind,
      status,
      title,
      prompt,
      metadata_json,
      response_json,
      created_at,
      resolved_at
    from checkpoints
    where id = ?
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
  const getArtifactStatement = database.prepare(`
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
    where id = ?
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
  const insertRunDispatchStatement = database.prepare(`
    insert into run_dispatches (
      id,
      run_id,
      worker_id,
      created_at,
      claimed_at
    ) values (?, ?, ?, ?, ?)
  `);
  const claimNextRunDispatchStatement = database.prepare(`
    select
      id,
      run_id,
      worker_id,
      created_at,
      claimed_at
    from run_dispatches
    where worker_id is null
    order by created_at asc, id asc
    limit 1
  `);
  const markRunDispatchClaimedStatement = database.prepare(`
    update run_dispatches
    set worker_id = ?, claimed_at = ?
    where id = ?
  `);
  const deleteRunDispatchStatement = database.prepare(`
    delete from run_dispatches
    where id = ?
  `);
  const upsertWorkflowEngineStateStatement = database.prepare(`
    insert into workflow_engine_states (
      run_id,
      next_node_id,
      visited_node_ids_json,
      emitted_event_count,
      spawned_run_ids_json,
      budget_usage_json,
      pending_checkpoint_id,
      pending_child_run_id,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(run_id) do update set
      next_node_id = excluded.next_node_id,
      visited_node_ids_json = excluded.visited_node_ids_json,
      emitted_event_count = excluded.emitted_event_count,
      spawned_run_ids_json = excluded.spawned_run_ids_json,
      budget_usage_json = excluded.budget_usage_json,
      pending_checkpoint_id = excluded.pending_checkpoint_id,
      pending_child_run_id = excluded.pending_child_run_id,
      updated_at = excluded.updated_at
  `);
  const getWorkflowEngineStateStatement = database.prepare(`
    select
      run_id,
      next_node_id,
      visited_node_ids_json,
      emitted_event_count,
      spawned_run_ids_json,
      budget_usage_json,
      pending_checkpoint_id,
      pending_child_run_id,
      updated_at
    from workflow_engine_states
    where run_id = ?
  `);
  const deleteWorkflowEngineStateStatement = database.prepare(`
    delete from workflow_engine_states
    where run_id = ?
  `);
  const upsertBrowserSessionStatement = database.prepare(`
    insert into browser_sessions (
      id,
      run_id,
      allowed_tool_names_json,
      created_at
    ) values (?, ?, ?, ?)
    on conflict(id) do update set
      run_id = excluded.run_id,
      allowed_tool_names_json = excluded.allowed_tool_names_json,
      created_at = excluded.created_at
  `);
  const getBrowserSessionStatement = database.prepare(`
    select
      id,
      run_id,
      allowed_tool_names_json,
      created_at
    from browser_sessions
    where id = ?
  `);
  const deleteBrowserSessionStatement = database.prepare(`
    delete from browser_sessions
    where id = ?
  `);
  const upsertAcpSessionStatement = database.prepare(`
    insert into acp_sessions (
      id,
      run_id,
      checkpoint_id,
      delegation_name,
      agent_ref,
      service_ref,
      status,
      output_artifact_ids_json,
      result_json,
      claimed_by,
      claimed_at,
      claim_expires_at,
      created_at,
      updated_at,
      resolved_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      run_id = excluded.run_id,
      checkpoint_id = excluded.checkpoint_id,
      delegation_name = excluded.delegation_name,
      agent_ref = excluded.agent_ref,
      service_ref = excluded.service_ref,
      status = excluded.status,
      output_artifact_ids_json = excluded.output_artifact_ids_json,
      result_json = excluded.result_json,
      claimed_by = excluded.claimed_by,
      claimed_at = excluded.claimed_at,
      claim_expires_at = excluded.claim_expires_at,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      resolved_at = excluded.resolved_at
  `);
  const getAcpSessionStatement = database.prepare(`
    select
      id,
      run_id,
      checkpoint_id,
      delegation_name,
      agent_ref,
      service_ref,
      status,
      output_artifact_ids_json,
      result_json,
      claimed_by,
      claimed_at,
      claim_expires_at,
      created_at,
      updated_at,
      resolved_at
    from acp_sessions
    where id = ?
  `);
  const listAcpSessionsStatement = database.prepare(`
    select
      id,
      run_id,
      checkpoint_id,
      delegation_name,
      agent_ref,
      service_ref,
      status,
      output_artifact_ids_json,
      result_json,
      claimed_by,
      claimed_at,
      claim_expires_at,
      created_at,
      updated_at,
      resolved_at
    from acp_sessions
    order by created_at asc
  `);
  const deleteAcpSessionStatement = database.prepare(`
    delete from acp_sessions
    where id = ?
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
    listRuns: (filter = {}) =>
      readRows<RunRow>(listRunsStatement.all())
        .map(mapRunRow)
        .filter((run) => matchesRunFilter(run, filter))
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
        JSON.stringify(checkpoint.metadata ?? {}),
        checkpoint.response === undefined
          ? null
          : JSON.stringify(checkpoint.response),
        checkpoint.createdAt,
        checkpoint.resolvedAt ?? null
      );
    },
    getCheckpoint: (checkpointId) => {
      const row = getCheckpointStatement.get(checkpointId) as CheckpointRow | undefined;

      return row ? mapCheckpointRow(row) : null;
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
    getArtifact: (artifactId) => {
      const row = getArtifactStatement.get(artifactId) as ArtifactRow | undefined;

      return row ? mapArtifactRow(row) : null;
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

  const dispatchRepo: DispatchRepo = {
    enqueueRun: (runId, createdAt = new Date().toISOString()) => {
      const row = {
        id: `dispatch_${Math.random().toString(36).slice(2, 10)}`,
        run_id: runId,
        worker_id: null,
        created_at: createdAt,
        claimed_at: null
      };

      insertRunDispatchStatement.run(
        row.id,
        row.run_id,
        row.worker_id,
        row.created_at,
        row.claimed_at
      );

      return mapRunDispatchRow(row);
    },
    claimNextDispatch: ({
      workerId,
      claimedAt
    }: ClaimNextDispatchInput) => {
      const row = claimNextRunDispatchStatement.get() as RunDispatchRow | undefined;

      if (!row) {
        return null;
      }

      markRunDispatchClaimedStatement.run(workerId, claimedAt, row.id);

      return mapRunDispatchRow({
        ...row,
        worker_id: workerId,
        claimed_at: claimedAt
      });
    },
    completeDispatch: (dispatchId) => {
      deleteRunDispatchStatement.run(dispatchId);
    }
  };

  const engineStateRepo: EngineStateRepo = {
    upsertState: (state) => {
      upsertWorkflowEngineStateStatement.run(
        state.runId,
        state.nextNodeId,
        JSON.stringify(state.visitedNodeIds),
        state.emittedEventCount,
        JSON.stringify(state.spawnedRunIds),
        JSON.stringify(state.budgetUsage),
        state.pendingCheckpointId ?? null,
        state.pendingChildRunId ?? null,
        state.updatedAt
      );
    },
    getState: (runId) => {
      const row = getWorkflowEngineStateStatement.get(runId) as
        | WorkflowEngineStateRow
        | undefined;

      return row ? mapWorkflowEngineStateRow(row) : null;
    },
    deleteState: (runId) => {
      deleteWorkflowEngineStateStatement.run(runId);
    }
  };

  const threadRepo: ThreadRepo = {
    createThread: (thread) => {
      upsertThreadStatement.run(thread.id, thread.title, thread.createdAt);
    },
    getThread: (threadId) => {
      const row = getThreadStatement.get(threadId) as ThreadRow | undefined;

      return row ? mapThreadRow(row) : null;
    },
    listThreads: () => readRows<ThreadRow>(listThreadsStatement.all()).map(mapThreadRow)
  };

  const acpSessionRepo: AcpSessionRepo = {
    upsertSession: (session) => {
      upsertAcpSessionStatement.run(
        session.id,
        session.runId,
        session.checkpointId,
        session.delegationName,
        session.agentRef,
        session.serviceRef ?? null,
        session.status,
        JSON.stringify(session.outputArtifactIds),
        session.result === undefined ? null : JSON.stringify(session.result),
        session.claimedBy ?? null,
        session.claimedAt ?? null,
        session.claimExpiresAt ?? null,
        session.createdAt,
        session.updatedAt,
        session.resolvedAt ?? null
      );
    },
    getSession: (sessionId) => {
      const row = getAcpSessionStatement.get(sessionId) as AcpSessionRow | undefined;

      return row ? mapAcpSessionRow(row) : null;
    },
    listSessions: (filter = {}) =>
      readRows<AcpSessionRow>(listAcpSessionsStatement.all())
        .map(mapAcpSessionRow)
        .filter((session) => {
          if (filter.runId && session.runId !== filter.runId) {
            return false;
          }

          if (filter.status && session.status !== filter.status) {
            return false;
          }

          if (filter.agentRef && session.agentRef !== filter.agentRef) {
            return false;
          }

          if (filter.serviceRef && session.serviceRef !== filter.serviceRef) {
            return false;
          }

          if (filter.claimedBy && session.claimedBy !== filter.claimedBy) {
            return false;
          }

          return true;
        }),
    deleteSession: (sessionId) => {
      deleteAcpSessionStatement.run(sessionId);
    }
  };

  const browserSessionRepo: BrowserSessionRepo = {
    createSession: (session) => {
      upsertBrowserSessionStatement.run(
        session.id,
        session.runId,
        JSON.stringify(session.allowedToolNames),
        session.createdAt
      );
    },
    getSession: (sessionId) => {
      const row = getBrowserSessionStatement.get(sessionId) as
        | BrowserSessionRow
        | undefined;

      return row ? mapBrowserSessionRow(row) : null;
    },
    deleteSession: (sessionId) => {
      deleteBrowserSessionStatement.run(sessionId);
    }
  };

  return {
    runs: runRepo,
    events: eventRepo,
    checkpoints: checkpointRepo,
    artifacts: artifactRepo,
    memory: memoryRepo,
    dispatches: dispatchRepo,
    engineStates: engineStateRepo,
    threads: threadRepo,
    acpSessions: acpSessionRepo,
    browserSessions: browserSessionRepo,
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
        childRuns: await runRepo.listRuns({
          parentRunId: runId
        }),
        memoryEntries: await memoryRepo.listMemoryEntriesForRun(runId)
      };
    }
  };
};
