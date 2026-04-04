#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

required=(PRESET_TOKEN)
missing=()
for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    missing+=("$key")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "SKIP: missing env vars: ${missing[*]}"
  exit 2
fi

GATEWAY_PORT="${GATEWAY_PORT:-8899}"
CONTROL_PLANE_PORT="${CONTROL_PLANE_PORT:-4310}"
APP_SECRET="${APP_SECRET:-geohelper-live-smoke-app-secret}"
SESSION_SECRET="${SESSION_SECRET:-geohelper-live-smoke-secret}"
SESSION_TTL_SECONDS="${SESSION_TTL_SECONDS:-1800}"

cleanup() {
  if [[ -n "${GATEWAY_PID:-}" ]] && kill -0 "$GATEWAY_PID" >/dev/null 2>&1; then
    kill "$GATEWAY_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${CONTROL_PLANE_PID:-}" ]] && kill -0 "$CONTROL_PLANE_PID" >/dev/null 2>&1; then
    kill "$CONTROL_PLANE_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

PORT="$GATEWAY_PORT" \
PRESET_TOKEN="$PRESET_TOKEN" \
APP_SECRET="$APP_SECRET" \
SESSION_SECRET="$SESSION_SECRET" \
SESSION_TTL_SECONDS="$SESSION_TTL_SECONDS" \
nohup pnpm --filter @geohelper/gateway start > .staging/live-smoke-gateway.log 2>&1 &
GATEWAY_PID=$!

PORT="$CONTROL_PLANE_PORT" \
nohup pnpm --filter @geohelper/control-plane start > .staging/live-smoke-control-plane.log 2>&1 &
CONTROL_PLANE_PID=$!

for i in {1..40}; do
  if curl -fsS "http://localhost:${GATEWAY_PORT}/api/v1/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

for i in {1..40}; do
  if curl -fsS -X POST "http://localhost:${CONTROL_PLANE_PORT}/api/v3/threads" \
    -H 'content-type: application/json' \
    -d '{"title":"control-plane-ready-probe"}' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

login_payload='{"token":"'"$PRESET_TOKEN"'","device_id":"smoke-device"}'
login_response="$(curl -fsS -X POST "http://localhost:${GATEWAY_PORT}/api/v1/auth/token/login" \
  -H 'content-type: application/json' \
  -d "$login_payload")"

session_token="$(node -e 'const r=JSON.parse(process.argv[1]); if(!r.session_token){process.exit(1)}; process.stdout.write(r.session_token)' "$login_response")"

thread_response="$(curl -fsS -X POST "http://localhost:${CONTROL_PLANE_PORT}/api/v3/threads" \
  -H 'content-type: application/json' \
  -d '{"title":"live model smoke"}')"

thread_id="$(node -e 'const r=JSON.parse(process.argv[1]); if(!r.thread || !r.thread.id){process.exit(1)}; process.stdout.write(r.thread.id)' "$thread_response")"

run_response="$(curl -fsS -X POST "http://localhost:${CONTROL_PLANE_PORT}/api/v3/threads/${thread_id}/runs" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer ${session_token}" \
  -d '{"profileId":"platform_geometry_standard","inputArtifactIds":[]}')"

run_id="$(node -e 'const r=JSON.parse(process.argv[1]); if(!r.run || !r.run.id){process.exit(1)}; process.stdout.write(r.run.id)' "$run_response")"

stream_response="$(curl -fsS "http://localhost:${CONTROL_PLANE_PORT}/api/v3/runs/${run_id}/stream")"

snapshot_response="$(node -e '
const text = process.argv[1];
const dataLine = text.split(/\n/).find((line) => line.startsWith("data: "));
if(!dataLine){ process.exit(1); }
process.stdout.write(JSON.stringify({ run_snapshot: JSON.parse(dataLine.slice(6)) }));
' "$stream_response")"

node -e '
const r=JSON.parse(process.argv[1]);
if(!r.run_snapshot || !r.run_snapshot.run || !r.run_snapshot.run.id){ process.exit(1); }
const artifacts = r.run_snapshot.artifacts;
if(!Array.isArray(artifacts)){ process.exit(1); }
const events = r.run_snapshot.events;
if(!Array.isArray(events) || events.length < 1){ process.exit(1); }
console.log(
  `OK: run=${r.run_snapshot.run.id}, artifacts=${artifacts.length}, events=${events.length}`
);
' "$snapshot_response"
