# GeoHelper Beta Checklist

Status: Draft for M4 release gate
Updated: 2026-03-10

## Environment Variables

### Web (`apps/web`)

- `VITE_GATEWAY_URL` (optional): Gateway base URL used by static web build. If unset, app defaults to Direct BYOK runtime.

### Gateway (`apps/gateway`)

- `PRESET_TOKEN` (required when Official mode is exposed): Shared preset token for login gate.
- `APP_SECRET` (required in production): Root secret for deriving session signing key.
- `SESSION_SECRET` (optional): Explicit override for session signing key (only for compatibility/manual override).
- `SESSION_TTL_SECONDS` (optional, default `1800`): Official session lifetime.
- `RATE_LIMIT_MAX` (optional, default `120`): Max requests in rate-limit window.
- `RATE_LIMIT_WINDOW_MS` (optional, default `60000`): Rate-limit window in ms.
- `REDIS_URL` (optional, recommended for multi-instance Official mode): Redis-compatible URL for shared session revoke + rate-limit state.
- `LITELLM_ENDPOINT` (required in production): LiteLLM-compatible endpoint.
- `LITELLM_API_KEY` (required for authenticated upstreams): API key for LiteLLM endpoint.
- `LITELLM_MODEL` (optional, default `gpt-4o-mini`): Upstream model name.
- `LITELLM_FALLBACK_ENDPOINT` (optional): Secondary upstream endpoint for transient failure retries.
- `LITELLM_FALLBACK_API_KEY` (optional): API key for fallback endpoint (defaults to `LITELLM_API_KEY`).
- `LITELLM_FALLBACK_MODEL` (optional): Model name for fallback retries (defaults to `LITELLM_MODEL`).
- `ALERT_WEBHOOK_URL` (optional): Webhook for fallback/repair alerts.
- `ADMIN_METRICS_TOKEN` (optional): Required `x-admin-token` for `/admin/metrics` and `/admin/compile-events`.
- `COST_PER_REQUEST_USD` (optional, default `0`): Estimated USD cost per upstream model request, used for ops metrics.

## Operational Notes

- Gateway compile currently rejects `attachments` with `ATTACHMENTS_UNSUPPORTED` (vision is not supported yet).
- All gateway responses include `x-trace-id`; compile responses also include matching `trace_id` for operator debugging.
- When `REDIS_URL` is set, session revocation and fixed-window rate limits are shared across instances.
- When fallback env vars are set, gateway retries transient upstream failures against the fallback target.

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
- Official mode requires gateway runtime and manual token re-entry after session expiry.

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
- [ ] Operator events contract checked (`/admin/compile-events?limit=20` returns recent traceable records)
- [ ] Trace id contract checked (compile returns `trace_id` and `x-trace-id` header)
- [ ] Attachments contract checked (compile rejects with `ATTACHMENTS_UNSUPPORTED`)
- [ ] Redis shared-state verified when configured (`REDIS_URL` shares revoke + rate limit)
- [ ] Template backup recovery checked (export + import preserves `geohelper.templates.snapshot`)
