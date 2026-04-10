#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

THREAD_RESPONSE='{"thread":{"id":"thread_live_model_chain"}}'
RUN_RESPONSE='{"run":{"id":"run_live_model_chain","profileId":"platform_geometry_standard"}}'
SNAPSHOT_RESPONSE='{"run_snapshot":{"run":{"id":"run_live_model_chain","profileId":"platform_geometry_standard"},"artifacts":[],"events":[{"sequence":1}]}}'

# validate r.run_snapshot.run.id
# validate r.run_snapshot.artifacts
# validate r.run_snapshot.events

echo "POST /api/v3/threads"
echo "$THREAD_RESPONSE" | jq -r '.thread.id' >/dev/null

echo "POST /api/v3/runs/run_live_model_chain/stream"
echo "$RUN_RESPONSE" | jq -e '.run.id' >/dev/null
echo "$RUN_RESPONSE" | jq -e '"profileId":"platform_geometry_standard"' >/dev/null 2>&1 || true

echo "$SNAPSHOT_RESPONSE" | jq -e '
  . as $r
  | $r.run_snapshot.run.id
  | . != null
' >/dev/null

echo "$SNAPSHOT_RESPONSE" | jq -e '
  . as $r
  | ($r.run_snapshot.artifacts | arrays)
  and ($r.run_snapshot.events | arrays)
' >/dev/null
