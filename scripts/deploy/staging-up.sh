#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

STAGING_DIR="$ROOT_DIR/.staging"
mkdir -p "$STAGING_DIR"

docker_usable() {
  docker version >/dev/null 2>&1
}

start_local_fallback() {
  echo "[staging] docker unavailable, using local fallback"
  pnpm install --frozen-lockfile
  VITE_GATEWAY_URL="${VITE_GATEWAY_URL:-http://localhost:8787}" \
    pnpm --filter @geohelper/web build

  PRESET_TOKEN="${PRESET_TOKEN:-geohelper-staging-token}" \
  APP_SECRET="${APP_SECRET:-geohelper-staging-app-secret}" \
  SESSION_SECRET="${SESSION_SECRET:-}" \
  SESSION_TTL_SECONDS="${SESSION_TTL_SECONDS:-1800}" \
  LITELLM_ENDPOINT="${LITELLM_ENDPOINT:-}" \
  LITELLM_API_KEY="${LITELLM_API_KEY:-}" \
  LITELLM_MODEL="${LITELLM_MODEL:-gpt-4o-mini}" \
  nohup pnpm --filter @geohelper/gateway start >"$STAGING_DIR/gateway.log" 2>&1 &
  echo $! >"$STAGING_DIR/gateway.pid"

  nohup pnpm --filter @geohelper/web preview --host 0.0.0.0 --port 4173 >"$STAGING_DIR/web.log" 2>&1 &
  echo $! >"$STAGING_DIR/web.pid"
}

if docker_usable; then
  echo "[staging] building and starting services via docker compose"
  docker compose -f docker-compose.staging.yml up -d --build
else
  start_local_fallback
fi

echo "[staging] waiting for gateway health"
for i in {1..40}; do
  if curl -fsS http://localhost:8787/api/v1/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

curl -fsS http://localhost:8787/api/v1/health | cat

echo "[staging] web: http://localhost:4173"
echo "[staging] gateway: http://localhost:8787"
