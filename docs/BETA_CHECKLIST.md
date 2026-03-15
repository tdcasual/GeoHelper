# GeoHelper Beta Checklist

Status: Draft for M4 release gate
Updated: 2026-03-12

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
- `BACKUP_MAX_HISTORY` (optional, default `10`): Max ordinary retained remote snapshot history entries.
- `BACKUP_MAX_PROTECTED` (optional, default `20`): Max retained protected snapshots.
- `COST_PER_REQUEST_USD` (optional, default `0`): Estimated USD cost per upstream model request, used for ops metrics.
- `GATEWAY_ENABLE_ATTACHMENTS` (optional, default `0`): Explicitly enables gateway image attachments; attachment support is never implied by model name alone.
- `OPS_BENCH_MIN_SUCCESS_RATE` (optional): Release threshold for composed ops benchmark success rate.
- `OPS_BENCH_MAX_P95_MS` (optional): Release threshold for composed ops benchmark per-domain p95 latency.

## Operational Notes

- `/api/v1/health` is liveness-only; use `/api/v1/ready` as the dependency-aware deploy gate before switching traffic.
- `pnpm ops:gateway:scheduled` is the recurring post-deploy entrypoint; it composes verify, artifact publish, and notify behind one stable cron command, and live runs can publish JSON evidence for each run.
- When `OPS_BENCH_MIN_SUCCESS_RATE` or `OPS_BENCH_MAX_P95_MS` is configured, threshold failures are release blockers and must stop promotion. Failed gateway backup restore drills are release blockers too. When a deployment intends to support image input, vision smoke failures block promotion as well.
- Published artifact URLs from scheduled runs are the post-deploy evidence source of truth.
- `/admin/version`, `/admin/compile-events`, `/admin/metrics`, and `/admin/backups/latest` share the same `x-admin-token` gate; `/admin/version` remains the release identity source of truth and backup routes expose latest snapshot metadata for recovery workflows.
- `x-trace-id` and compile `trace_id` are the main debugging join keys across alerts, smoke runs, `/admin/compile-events`, and `/admin/traces/:traceId`.
- `REDIS_URL` remains the only supported shared fast-state dependency in Gateway V4; no SQL or extra backend datastore is required in this roadmap.
- Web lightweight cloud sync remains snapshot-based; no SQL or full cloud history backend is required, startup freshness checks are metadata-only, and delayed upload is opt-in and never auto-restores.
- ordinary retained history and protected retained snapshots are bounded separately via `BACKUP_MAX_HISTORY` and `BACKUP_MAX_PROTECTED`.
- protected snapshots do not auto-expire, and new protect requests fail explicitly when protected capacity is full.
- `保护此快照` / `取消保护` is a manual metadata operation and does not imply import or restore.
- browser sync defaults to guarded writes, force overwrite requires an explicit danger action, and the unconditional admin latest write remains operator-only.
- Retained remote snapshot history can be inspected explicitly, selected historical snapshots can be fetched by `snapshot_id`, and blocked/conflict sync states should be resolved through explicit selected-snapshot pull/import or explicit overwrite.
- Gateway latest-backup recovery remains explicit and single-tenant; there is no background sync service or backup catalog in this phase.
- Web remote backup UI is opt-in and requires a configured gateway admin token before upload/download actions are enabled.
- When `REDIS_URL` is enabled, compile event retention and latest backup retention become durable across process restarts and power operator recovery queries.
- Gateway image attachments are an explicitly gated capability: `GATEWAY_ENABLE_ATTACHMENTS=1` plus passing vision smoke are required before promotion.
- direct runtime and gateway runtime can legitimately differ in vision support.
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
- Web is local-first persistence only (IndexedDB/localStorage); lightweight cloud sync is limited to snapshot recovery and is not a full cloud history backend.
- Official mode requires gateway runtime and manual token re-entry after session expiry.

## On-call & Contacts

- Incident Owner: `@tdcasual`
- Backup Owner: `@lvxiaoer`
- Infra Escalation: `@tdcasual`
- Product Escalation: `@tdcasual`
- Communication Channel: `#geohelper-release`

## Pre-Release Gate

- [ ] Lint passes (`pnpm lint`)
- [ ] Dependency boundary check passes (`pnpm deps:check`)
- [ ] Architecture verification passes (`pnpm verify:architecture`)
- [ ] Workspace tests pass (`pnpm test`)
- [ ] Gateway tests pass (`pnpm --filter @geohelper/gateway test`)
- [ ] Web unit tests pass (`pnpm --filter @geohelper/web test`)
- [ ] E2E tests pass (`pnpm test:e2e`)
- [ ] Benchmark dry-run passes (`pnpm bench:quality -- --dry-run`)
- [ ] Ops verify passes (`pnpm ops:gateway:verify -- --dry-run`, live runs persist JSON artifacts under `output/ops/`)
- [ ] Scheduled ops wrapper checked (`pnpm ops:gateway:scheduled -- --dry-run`, optional publish stage returns artifact URLs when enabled and serves as the recurring scheduler entrypoint)
- [ ] Scheduled notify heartbeat checked (`OPS_NOTIFY_WEBHOOK_URL` receives compact success/failure summaries with threshold reasons and artifact URLs when enabled)
- [ ] Gateway runtime smoke checked (`pnpm smoke:gateway-runtime -- --dry-run`, plus optional live run verifying `/admin/version`, compile trace visibility, and metrics movement)
- [ ] Gateway backup restore drill checked (`pnpm smoke:gateway-backup-restore -- --dry-run`, live restore drill failures block promotion)
- [ ] Deploy runbook reviewed (`docs/deploy/edgeone.md`)
- [ ] Alert webhook smoke-tested (trigger one fallback/repair compile and verify webhook receives event)
- [ ] Liveness/readiness contract checked (`/api/v1/health` stays shallow, `/api/v1/ready` is green before traffic switch)
- [ ] Metrics contract checked (`/admin/metrics` includes `fallback_rate`, `p95_latency_ms`, `cost_per_request_usd`)
- [ ] Operator events contract checked (`/admin/compile-events?limit=20` returns recent traceable records)
- [ ] Trace id contract checked (compile returns `trace_id` and `x-trace-id` header)
- [ ] Attachments contract checked (gateway attachment support is explicit, `/admin/version` reflects `attachments_enabled`, and vision smoke failures block promotion when image input is intended)
- [ ] Redis shared-state verified when configured (`REDIS_URL` shares revoke + rate limit + backup retention)
- [ ] Template backup recovery checked (export + import preserves `geohelper.templates.snapshot`)
- [ ] Gateway backup admin routes checked (`PUT/GET /admin/backups/latest` returns metadata and latest envelope with valid admin token)
- [ ] Remote backup settings flow checked (gateway admin token saved, retained history is visible after `检查云端状态`, selected historical snapshots can be fetched by `snapshot_id`, blocked/conflict states point users to explicit pull/import or explicit overwrite, and `检查云端状态` / `上传最新快照` / `拉取最新快照` stay explicit and manual)
- [ ] Protected snapshot policy checked (`BACKUP_MAX_HISTORY` / `BACKUP_MAX_PROTECTED` are configured intentionally, protected snapshots do not auto-expire, limit-full protect returns an explicit failure, and settings protection remains metadata-only)
