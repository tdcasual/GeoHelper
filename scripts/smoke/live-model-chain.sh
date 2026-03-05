#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

required=(LITELLM_ENDPOINT LITELLM_API_KEY PRESET_TOKEN)
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

PORT="${PORT:-8899}"
APP_SECRET="${APP_SECRET:-geohelper-live-smoke-app-secret}"
SESSION_SECRET="${SESSION_SECRET:-geohelper-live-smoke-secret}"
SESSION_TTL_SECONDS="${SESSION_TTL_SECONDS:-1800}"
LITELLM_MODEL="${LITELLM_MODEL:-gpt-4o-mini}"

cleanup() {
  if [[ -n "${GATEWAY_PID:-}" ]] && kill -0 "$GATEWAY_PID" >/dev/null 2>&1; then
    kill "$GATEWAY_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

PORT="$PORT" \
PRESET_TOKEN="$PRESET_TOKEN" \
APP_SECRET="$APP_SECRET" \
SESSION_SECRET="$SESSION_SECRET" \
SESSION_TTL_SECONDS="$SESSION_TTL_SECONDS" \
LITELLM_ENDPOINT="$LITELLM_ENDPOINT" \
LITELLM_API_KEY="$LITELLM_API_KEY" \
LITELLM_MODEL="$LITELLM_MODEL" \
nohup pnpm --filter @geohelper/gateway start > .staging/live-smoke-gateway.log 2>&1 &
GATEWAY_PID=$!

for i in {1..40}; do
  if curl -fsS "http://localhost:${PORT}/api/v1/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

login_payload='{"token":"'"$PRESET_TOKEN"'","device_id":"smoke-device"}'
login_response="$(curl -fsS -X POST "http://localhost:${PORT}/api/v1/auth/token/login" \
  -H 'content-type: application/json' \
  -d "$login_payload")"

session_token="$(node -e 'const r=JSON.parse(process.argv[1]); if(!r.session_token){process.exit(1)}; process.stdout.write(r.session_token)' "$login_response")"

compile_payload='{"message":"创建点A=(0,0)，画一个半径为3的圆","mode":"official"}'
compile_response="$(curl -fsS -X POST "http://localhost:${PORT}/api/v1/chat/compile" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer ${session_token}" \
  -d "$compile_payload")"

node -e '
const r=JSON.parse(process.argv[1]);
if(!r.batch || !Array.isArray(r.batch.commands)){ process.exit(1); }
if(!Array.isArray(r.agent_steps) || r.agent_steps.length < 4){ process.exit(1); }
console.log(`OK: commands=${r.batch.commands.length}, steps=${r.agent_steps.length}`);
' "$compile_response"
