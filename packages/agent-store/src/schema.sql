create table if not exists runs (
  id text primary key,
  thread_id text not null,
  profile_id text not null,
  status text not null,
  parent_run_id text,
  budget_json text not null,
  input_artifact_ids_json text not null,
  output_artifact_ids_json text not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists run_events (
  id text primary key,
  run_id text not null,
  sequence integer not null,
  event_type text not null,
  payload_json text not null,
  created_at text not null,
  foreign key (run_id) references runs(id) on delete cascade
);

create table if not exists checkpoints (
  id text primary key,
  run_id text not null,
  node_id text not null,
  kind text not null,
  status text not null,
  title text not null,
  prompt text not null,
  response_json text,
  created_at text not null,
  resolved_at text,
  foreign key (run_id) references runs(id) on delete cascade
);

create table if not exists artifacts (
  id text primary key,
  run_id text not null,
  kind text not null,
  content_type text not null,
  storage text not null,
  inline_data_json text,
  blob_uri text,
  metadata_json text not null default '{}',
  created_at text not null,
  foreign key (run_id) references runs(id) on delete cascade
);

create table if not exists memory_entries (
  id text primary key,
  scope text not null,
  scope_id text not null,
  key text not null,
  value_json text not null,
  source_run_id text,
  source_artifact_id text,
  created_at text not null
);

create index if not exists idx_runs_status_created_at
  on runs(status, created_at);

create unique index if not exists idx_run_events_run_id_sequence
  on run_events(run_id, sequence);

create index if not exists idx_checkpoints_run_id_created_at
  on checkpoints(run_id, created_at);

create index if not exists idx_checkpoints_status_created_at
  on checkpoints(status, created_at);

create index if not exists idx_artifacts_run_id_created_at
  on artifacts(run_id, created_at);

create index if not exists idx_memory_entries_source_run_id_created_at
  on memory_entries(source_run_id, created_at);
