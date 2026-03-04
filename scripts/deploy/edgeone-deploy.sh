#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ -z "${EDGEONE_PROJECT_NAME:-}" ]]; then
  echo "EDGEONE_PROJECT_NAME is required"
  exit 1
fi

if [[ -z "${EDGEONE_API_TOKEN:-}" ]]; then
  echo "EDGEONE_API_TOKEN is required"
  exit 1
fi

ENVIRONMENT="${EDGEONE_ENVIRONMENT:-preview}"
VITE_GATEWAY_URL="${VITE_GATEWAY_URL:-}"

if [[ -z "$VITE_GATEWAY_URL" ]]; then
  echo "VITE_GATEWAY_URL is required"
  exit 1
fi

corepack enable
pnpm install --frozen-lockfile
VITE_GATEWAY_URL="$VITE_GATEWAY_URL" pnpm --filter @geohelper/web build

pnpm dlx edgeone pages deploy \
  --project-name "$EDGEONE_PROJECT_NAME" \
  --environment-name "$ENVIRONMENT" \
  --token "$EDGEONE_API_TOKEN" \
  --dir ./apps/web/dist
