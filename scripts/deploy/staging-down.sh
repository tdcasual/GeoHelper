#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

STAGING_DIR="$ROOT_DIR/.staging"

docker_usable() {
  docker version >/dev/null 2>&1
}

if docker_usable; then
  docker compose -f docker-compose.staging.yml down --remove-orphans
fi

for file in "$STAGING_DIR/gateway.pid" "$STAGING_DIR/control-plane.pid" "$STAGING_DIR/web.pid"; do
  if [[ -f "$file" ]]; then
    pid="$(cat "$file")"
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
    rm -f "$file"
  fi
done
