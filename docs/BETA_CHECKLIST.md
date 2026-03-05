# GeoHelper Beta Checklist

Status: Draft for M4 release gate
Updated: 2026-03-05

## Environment Variables

### Web (`apps/web`)

- `VITE_GATEWAY_URL` (required): Gateway base URL used by static web build.

### Gateway (`apps/gateway`)

- `PRESET_TOKEN` (required in official mode): Shared preset token for login gate.
- `APP_SECRET` (required): Root secret for deriving session signing key.
- `SESSION_SECRET` (optional): Explicit override for session signing key (only for compatibility/manual override).
- `SESSION_TTL_SECONDS` (optional, default `3600`): Official session lifetime.
- `RATE_LIMIT_MAX` (optional, default `30`): Max requests in rate-limit window.
- `RATE_LIMIT_WINDOW_MS` (optional, default `60000`): Rate-limit window in ms.
- `LITELLM_ENDPOINT` (required): LiteLLM-compatible endpoint.
- `LITELLM_API_KEY` (required): API key for LiteLLM endpoint.
- `ALERT_WEBHOOK_URL` (optional): Webhook for fallback/repair alerts.
- `ADMIN_METRICS_TOKEN` (optional): Required `x-admin-token` for `/admin/metrics`.
- `COST_PER_REQUEST_USD` (optional, default `0`): Estimated USD cost per upstream model request, used for ops metrics.

## Rollback Plan

1. Web rollback: redeploy previous successful static artifact on EdgeOne.
2. Gateway rollback: redeploy previous container/image tag and restart gateway pods.
3. Session safety: rotate `APP_SECRET` (or `SESSION_SECRET` override if used) to invalidate old sessions when incident involves token leakage.
4. Traffic safety: reduce `RATE_LIMIT_MAX` temporarily to protect upstream model quota.
5. Validation after rollback:
   - `GET /api/v1/health` returns `ok`.
   - official token login works and compile returns 200 for a smoke prompt.
   - `GET /admin/metrics` is reachable with valid admin token when enabled.

## Known Limits

- Current benchmark set is fixed 80 prompts (20 per domain) and is not multilingual-balanced yet.
- Benchmark runner executes sequentially to avoid false positives under strict rate limits.
- `retry_count` currently estimates repair pass count from agent step signals, not full retry traces.
- Web is local-first persistence only (IndexedDB/localStorage); cloud history sync is not in beta scope.
- Official mode requires manual token re-entry after session expiry.

## On-call & Contacts

- Incident Owner: `@tdcasual`
- Backup Owner: `@lvxiaoer`
- Infra Escalation: `@tdcasual`
- Product Escalation: `@tdcasual`
- Communication Channel: `#geohelper-release`

## Pre-Release Gate

- [ ] Workspace tests pass (`pnpm test`)
- [ ] Gateway tests pass (`pnpm --filter @geohelper/gateway test`)
- [ ] Web unit tests pass (`pnpm --filter @geohelper/web test`)
- [ ] E2E tests pass (`pnpm test:e2e`)
- [ ] Benchmark dry-run passes (`pnpm bench:quality -- --dry-run`)
- [ ] Deploy runbook reviewed (`docs/deploy/edgeone.md`)
- [ ] Alert webhook smoke-tested (trigger one fallback/repair compile and verify webhook receives event)
- [ ] Metrics contract checked (`/admin/metrics` includes `fallback_rate`, `p95_latency_ms`, `cost_per_request_usd`)
- [ ] Template backup recovery checked (export + import preserves `geohelper.templates.snapshot`)
