create table if not exists runs (
  id text primary key,
  thread_id text not null,
  workflow_id text not null,
  agent_id text not null,
  status text not null,
  parent_run_id text,
  budget jsonb not null,
  input_artifact_ids jsonb not null,
  output_artifact_ids jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists run_events (
  id text primary key,
  run_id text not null references runs(id) on delete cascade,
  sequence integer not null,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null
);

create table if not exists checkpoints (
  id text primary key,
  run_id text not null references runs(id) on delete cascade,
  node_id text not null,
  kind text not null,
  status text not null,
  title text not null,
  prompt text not null,
  response jsonb,
  created_at timestamptz not null,
  resolved_at timestamptz
);

create table if not exists artifacts (
  id text primary key,
  run_id text not null references runs(id) on delete cascade,
  kind text not null,
  content_type text not null,
  storage text not null,
  inline_data jsonb,
  blob_uri text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null
);

create table if not exists memory_entries (
  id text primary key,
  scope text not null,
  scope_id text not null,
  key text not null,
  value jsonb not null,
  source_run_id text,
  source_artifact_id text,
  created_at timestamptz not null
);
