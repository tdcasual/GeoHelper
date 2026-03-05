#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

REPO="${GITHUB_REPOSITORY:-}"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: $0 [--repo <owner/repo>] [--dry-run]"
      exit 1
      ;;
  esac
done

if [[ -z "$REPO" ]]; then
  REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
fi

required=(
  EDGEONE_PROJECT_NAME
  EDGEONE_API_TOKEN
  STAGING_GATEWAY_URL
  PRESET_TOKEN
  APP_SECRET
  LITELLM_ENDPOINT
  LITELLM_API_KEY
)

optional=(
  SESSION_SECRET
  LITELLM_MODEL
  ALERT_WEBHOOK_URL
  ADMIN_METRICS_TOKEN
  COST_PER_REQUEST_USD
)

missing=()
set_count=0

set_secret() {
  local key="$1"
  local value="${!key:-}"

  if [[ -z "$value" ]]; then
    return 1
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] gh secret set $key --repo $REPO --body <redacted>"
  else
    gh secret set "$key" --repo "$REPO" --body "$value"
    echo "[ok] set $key"
  fi
  set_count=$((set_count + 1))
  return 0
}

echo "[info] target repo: $REPO"
echo "[info] applying required secrets..."
for key in "${required[@]}"; do
  if ! set_secret "$key"; then
    missing+=("$key")
    echo "[missing] $key"
  fi
done

echo "[info] applying optional secrets (if present)..."
for key in "${optional[@]}"; do
  if set_secret "$key"; then
    :
  else
    echo "[skip] $key not set locally"
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo ""
  echo "[error] missing required local env vars:"
  printf '  - %s\n' "${missing[@]}"
  echo ""
  echo "Set them in your shell, then rerun:"
  echo "  bash scripts/deploy/configure-release-secrets.sh --repo $REPO"
  exit 2
fi

echo "[done] secrets configured ($set_count keys written)."
