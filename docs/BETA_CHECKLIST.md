# GeoHelper Beta Checklist

Status: Draft for M4 release gate
Updated: 2026-03-11

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
- `ALERT_WEBHOOK_URL` (optional): Webhook for fallback/repair/timeout/runtime-capacity alerts.
- `COMPILE_MAX_IN_FLIGHT` (optional, default `4`): Max concurrent compile requests allowed per gateway instance before returning `GATEWAY_BUSY`.
- `COMPILE_TIMEOUT_MS` (optional, default `30000`): Timeout budget per compile request before returning `COMPILE_TIMEOUT`.
- `ADMIN_METRICS_TOKEN` (optional): Required `x-admin-token` for `/admin/version`, `/admin/metrics`, `/admin/compile-events`, and `/admin/backups/latest`.
- `COST_PER_REQUEST_USD` (optional, default `0`): Estimated USD cost per upstream model request, used for ops metrics.
- `OPS_BENCH_MIN_SUCCESS_RATE` (optional): Release threshold for composed ops benchmark success rate.
- `OPS_BENCH_MAX_P95_MS` (optional): Release threshold for composed ops benchmark per-domain p95 latency.

## Operational Notes

- `/api/v1/health` is liveness-only; use `/api/v1/ready` as the dependency-aware deploy gate before switching traffic.
- `/admin/version`, `/admin/compile-events`, `/admin/metrics`, and `/admin/backups/latest` share the same `x-admin-token` gate; `/admin/version` remains the release identity source of truth and backup routes expose latest snapshot metadata for recovery workflows.
- `x-trace-id` and compile `trace_id` are the main debugging join keys across alerts, smoke runs, `/admin/compile-events`, and `/admin/traces/:traceId`.
- `REDIS_URL` remains the only supported shared fast-state dependency in Gateway V4; no SQL or extra backend datastore is required in this roadmap.
- When `REDIS_URL` is enabled, compile event retention and latest backup retention become durable across process restarts and power operator recovery queries.
- Gateway compile currently rejects `attachments` with `ATTACHMENTS_UNSUPPORTED` (vision is not supported yet).
- When fallback env vars are set, gateway retries transient upstream failures against the fallback target.
- Compile runtime protection is instance-local: overlapping requests beyond `COMPILE_MAX_IN_FLIGHT` return `503 GATEWAY_BUSY`, and stalled compiles beyond `COMPILE_TIMEOUT_MS` return `504 COMPILE_TIMEOUT` with traceable operator events.

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
- [ ] Gateway runtime smoke checked (`pnpm smoke:gateway-runtime -- --dry-run`, plus optional live run verifying `/admin/version`, compile trace visibility, and metrics movement)
- [ ] Deploy runbook reviewed (`docs/deploy/edgeone.md`)
- [ ] Alert webhook smoke-tested (trigger one fallback/repair compile and verify webhook receives event)
- [ ] Liveness/readiness contract checked (`/api/v1/health` stays shallow, `/api/v1/ready` is green before traffic switch)
- [ ] Metrics contract checked (`/admin/metrics` includes `fallback_rate`, `p95_latency_ms`, `cost_per_request_usd`)
- [ ] Operator events contract checked (`/admin/compile-events?limit=20` returns recent traceable records)
- [ ] Trace id contract checked (compile returns `trace_id` and `x-trace-id` header)
- [ ] Attachments contract checked (compile rejects with `ATTACHMENTS_UNSUPPORTED`)
- [ ] Redis shared-state verified when configured (`REDIS_URL` shares revoke + rate limit + backup retention)
- [ ] Template backup recovery checked (export + import preserves `geohelper.templates.snapshot`)
- [ ] Gateway backup admin routes checked (`PUT/GET /admin/backups/latest` returns metadata and latest envelope with valid admin token)
