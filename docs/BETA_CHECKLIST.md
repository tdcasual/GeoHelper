# GeoHelper Beta Checklist

Status: Draft for M4 release gate
Updated: 2026-03-31

## M4 Release Boundary

- Internal callers now use the platform control plane surfaces: `POST /api/v3/threads`, `POST /api/v3/threads/:threadId/runs`, and `GET /api/v3/runs/:runId/stream`.
- Gateway remains active for health, Official token, backup, metrics, and version endpoints; legacy compile routes are no longer part of the active runtime boundary.
- Release topology is explicit: `web + gateway + control-plane`, with standalone worker remaining an optional scale-out surface instead of a required baseline service.
- Demo/export/presentation work and any backend expansion beyond the current self-hosted gateway + control plane stack (with optional standalone worker) stay out of scope for this release gate.

## Release Evidence

### 2026-03-31 Current Branch Re-Verification

- Full release gate commands passed on 2026-03-31: `pnpm lint`, `pnpm deps:check`, `pnpm verify:architecture`, `pnpm test`, `pnpm typecheck`, `pnpm build:web`, `pnpm test:e2e`, `pnpm bench:quality -- --dry-run`, `pnpm ops:gateway:verify -- --dry-run`, `pnpm ops:gateway:scheduled -- --dry-run`, `pnpm smoke:gateway-runtime -- --dry-run`, `pnpm smoke:gateway-backup-restore -- --dry-run`.
- Backup/recovery verification passed on 2026-03-31: `pnpm test -- --run apps/web/src/storage/backup.import.test.ts apps/web/src/storage/migrate.test.ts apps/gateway/test/redis-backup-store.protection.test.ts apps/web/src/components/settings-remote-backup-actions.test.ts apps/web/src/components/settings-remote-backup-history.test.ts apps/web/src/components/settings-remote-backup-import.test.ts apps/web/src/components/settings-remote-backup-sync.test.ts`.
- Remote backup settings E2E verification passed on 2026-03-31: `pnpm test:e2e -- tests/e2e/settings-drawer.backup.spec.ts tests/e2e/settings-drawer.remote-sync.spec.ts tests/e2e/settings-drawer.remote-import.spec.ts tests/e2e/settings-drawer.remote-history.spec.ts tests/e2e/settings-drawer.remote-protection.spec.ts`.
- Studio/teacher/vnext regression verification passed on 2026-03-31: `pnpm test:e2e -- tests/e2e/studio-review-flow.spec.ts tests/e2e/studio-result-panel.spec.ts tests/e2e/studio-canvas-link.spec.ts tests/e2e/studio-input-panel.spec.ts tests/e2e/teacher-template-library.spec.ts tests/e2e/vnext-homepage.spec.ts tests/e2e/vnext-workspace-layout.spec.ts`.
- Redis-backed localhost live verification passed on 2026-03-31 against `http://127.0.0.1:8877`, `http://127.0.0.1:8878`, and `http://127.0.0.1:8879`, with evidence in `output/ops/manual-phase4/redis-shared-state.json`, `output/ops/manual-phase4/backup-seed-live.json`, `output/ops/manual-phase4/smoke-live.json`, `output/ops/manual-phase4/backup-restore-live.json`, `output/ops/manual-phase4/benchmark-live.json`, `output/ops/manual-phase4/scheduled-live.json`, and `output/ops/2026-03-31T08-50-00-phase6-redis-live/summary.json`.
- Historical 2026-03-19 evidence remains valid background context, but the current branch now also has fresh local verification after the platform run cutover and maintainability guard sync.

### 2026-03-19 Local Verification

- Local release gate commands passed on 2026-03-19: `pnpm lint`, `pnpm deps:check`, `pnpm verify:architecture`, `pnpm test`, `pnpm --filter @geohelper/gateway test`, `pnpm --filter @geohelper/web test`, `pnpm test:e2e`, `pnpm bench:quality -- --dry-run`, `pnpm typecheck`, `pnpm build:web`.
- Dry-run staging evidence passed on 2026-03-19: `pnpm ops:gateway:verify -- --dry-run`, `pnpm ops:gateway:scheduled -- --dry-run`, `pnpm smoke:gateway-runtime -- --dry-run`, `pnpm smoke:gateway-backup-restore -- --dry-run`.
- Localhost staging candidate live evidence passed on 2026-03-19 against `http://127.0.0.1:8787`, with artifacts under `output/ops/2026-03-19T17-50-10-local-staging/`: live `pnpm smoke:gateway-runtime`, live `pnpm smoke:gateway-backup-restore`, live `pnpm ops:gateway:scheduled`, `/api/v1/health`, `/api/v1/ready`, `/admin/version`, `/admin/metrics`, and backup restore evidence.
- Shared staging / external live evidence is still pending if release sign-off requires a non-localhost gateway target and real operator credentials. Required environment for that remaining pass: `GATEWAY_URL=https://<gateway-domain>` and `ADMIN_METRICS_TOKEN=<admin-token>`.

### Release-Candidate Shared-Staging Evidence

- Shared-staging / external live evidence is now a first-class release phase. Each shared-staging run must connect to the real `GATEWAY_URL` and `CONTROL_PLANE_URL`, log in with `PRESET_TOKEN`, and use `ADMIN_METRICS_TOKEN` when the admin surfaces and bundle audit traces are protected.
- For drill-down, operators should run `pnpm smoke:gateway-runtime`, `pnpm smoke:gateway-backup-restore`, `pnpm smoke:platform-run-remote`, and `pnpm ops:gateway:scheduled` in that order. For the actual sign-off pass, `pnpm ops:release-candidate:live` is the single release-gate wrapper around the same checks plus the bundle rehearsal. It writes `output/ops/<timestamp>/release-candidate-summary.json`, which captures `gatewayRuntime`, `backupRestore`, `platformRun`, `scheduledVerify`, published artifact URLs, and the portable-bundle audit details that reference `rehearsedExtractionCandidate`, `verifyImport`, and `extractionBlockers`.
- Operators must note the exact execution date, the staging domains, and the artifact directory inside this checklist entry. If a pass is blocked (missing credentials, publishing failures, or failing thresholds), the blocker must be documented instead of leaving the record blank so the next ship-bearing run can start from a clean slate.
- 2026-04-09 blocker note: this workspace could not run the shared-staging pass because `GATEWAY_URL`, `CONTROL_PLANE_URL`, `PRESET_TOKEN`, and `ADMIN_METRICS_TOKEN` were all unset in the execution shell. The next live sign-off run must execute `pnpm ops:release-candidate:live` with real staging credentials and record the resulting `output/ops/<timestamp>/release-candidate-summary.json` directory here.

## Environment Variables

### Web (`apps/web`)

- `VITE_GATEWAY_URL` (optional): Gateway base URL used by static web build for Official token login and remote backup.
- `VITE_CONTROL_PLANE_URL` (optional): Control-plane base URL used by static web build for `/api/v3/*` and `/admin/bundles`; if unset, web falls back to `VITE_GATEWAY_URL`.

### Gateway (`apps/gateway`)

- `PRESET_TOKEN` (required when Official mode is exposed): Shared preset token for login gate.
- `APP_SECRET` (required in production): Root secret for deriving session signing key.
- `SESSION_SECRET` (optional): Explicit override for session signing key.
- `SESSION_TTL_SECONDS` (optional, default `1800`): Official session lifetime.
- `REDIS_URL` (optional, recommended for multi-instance Official mode): Redis-compatible URL for shared session revoke + backup state.
- `ALERT_WEBHOOK_URL` (optional): Webhook for gateway 5xx/operator alerts.
- `ADMIN_METRICS_TOKEN` (optional): Required `x-admin-token` for `/admin/version`, `/admin/metrics`, and `/admin/backups/*`.
- `BACKUP_MAX_HISTORY` (optional, default `10`): Max ordinary retained remote snapshot history entries.
- `BACKUP_MAX_PROTECTED` (optional, default `20`): Max retained protected snapshots.
- `GATEWAY_ENABLE_ATTACHMENTS` (optional, default `0`): Explicitly enables gateway image attachments; attachment support is never implied by model name alone.
- `OPS_BENCH_MIN_SUCCESS_RATE` (optional): Release threshold for composed ops benchmark success rate.
- `OPS_BENCH_MAX_P95_MS` (optional): Release threshold for composed ops benchmark per-domain p95 latency.

## Operational Notes

- `/api/v1/health` is liveness-only; use `/api/v1/ready` as the dependency-aware deploy gate before switching traffic.
- `pnpm ops:gateway:scheduled` is the recurring post-deploy entrypoint; it composes verify, artifact publish, and notify behind one stable cron command, and live runs can publish JSON evidence for each run.
- Ops summaries now surface both `gateway_probes` and `control_plane_probes`; `GET /api/v3/ready` is a first-class release blocker even when gateway probes remain green.
- When `OPS_BENCH_MIN_SUCCESS_RATE` or `OPS_BENCH_MAX_P95_MS` is configured, threshold failures are release blockers and must stop promotion. Failed gateway backup restore drills are release blockers too. When a deployment intends to support image input, vision smoke failures block promotion as well.
- Published artifact URLs from scheduled runs are the post-deploy evidence source of truth.
- `/admin/version`, `/admin/metrics`, and `/admin/backups/*` share the same `x-admin-token` gate; `/admin/version` remains the release identity source of truth and backup routes expose latest snapshot metadata for recovery workflows.
- `x-trace-id` remains the gateway-side correlation key across responses, logs, and alert payloads.
- `REDIS_URL` remains the only supported shared fast-state dependency in Gateway V4; no SQL or extra backend datastore is required in this roadmap.
- Gateway and control-plane images publish independently to GHCR and both must keep a mutable `:staging` tag plus immutable `:sha-<shortsha>` tag available for promotion and rollback.
- Web lightweight cloud sync remains snapshot-based; no SQL or full cloud history backend is required, startup freshness checks are metadata-only, and delayed upload is opt-in and never auto-restores.
- ordinary retained history and protected retained snapshots are bounded separately via `BACKUP_MAX_HISTORY` and `BACKUP_MAX_PROTECTED`.
- protected snapshots do not auto-expire, and new protect requests fail explicitly when protected capacity is full.
- `保护此快照` / `取消保护` is a manual metadata operation and does not imply import or restore.
- browser sync defaults to guarded writes, force overwrite requires an explicit danger action, and the unconditional admin latest write remains operator-only.
- Retained remote snapshot history can be inspected explicitly, selected historical snapshots can be fetched by `snapshot_id`, and blocked/conflict sync states should be resolved through explicit selected-snapshot pull/import or explicit overwrite.
- Gateway latest-backup recovery remains explicit and single-tenant; there is no background sync service or backup catalog in this phase.
- Web remote backup UI is opt-in and requires a configured gateway admin token before upload/download actions are enabled.
- When `REDIS_URL` is enabled, session revoke state and latest backup retention become durable across process restarts and power operator recovery queries.
- Gateway image attachments are an explicitly gated capability: `GATEWAY_ENABLE_ATTACHMENTS=1` plus passing vision smoke are required before promotion.
- direct runtime and gateway runtime can legitimately differ in vision support.
- OpenClaw portability claims now require at least one bundle with `rehearsedExtractionCandidate: true`, a captured `verifyImport` result from the admin bundle audit surface, and an explicit review of any non-empty `extractionBlockers`.

## Rollback Plan

1. Web rollback: redeploy previous successful static artifact on EdgeOne.
2. Gateway rollback: redeploy previous container/image tag and restart gateway pods.
3. Session safety: rotate `APP_SECRET` (or `SESSION_SECRET` override if used) to invalidate old sessions when incident involves token leakage.
4. Traffic safety: revoke leaked sessions and disable risky backup/admin traffic until a clean deploy is restored.
5. Validation after rollback:
   - `GET /api/v1/health` returns `ok`.
   - official token login and revoke both work for a smoke flow.
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

- [x] Lint passes (`pnpm lint`, verified 2026-03-19 and reverified 2026-03-31)
- [x] Dependency boundary check passes (`pnpm deps:check`, verified 2026-03-19 and reverified 2026-03-31)
- [x] Architecture verification passes (`pnpm verify:architecture`, verified 2026-03-19 and reverified 2026-03-31)
- [x] Workspace tests pass (`pnpm test`, verified 2026-03-19 and reverified 2026-03-31)
- [x] Gateway tests pass (`pnpm --filter @geohelper/gateway test`, verified 2026-03-19; gateway coverage also re-executed inside `pnpm test` and `pnpm verify:architecture` on 2026-03-31)
- [x] Web unit tests pass (`pnpm --filter @geohelper/web test`, verified 2026-03-19; web coverage also re-executed inside `pnpm test` and `pnpm verify:architecture` on 2026-03-31)
- [x] E2E tests pass (`pnpm test:e2e`, verified 2026-03-19 and reverified 2026-03-31)
- [x] Benchmark dry-run passes (`pnpm bench:quality -- --dry-run`, verified 2026-03-19 and reverified 2026-03-31)
- [x] Ops verify passes (`pnpm ops:gateway:verify -- --dry-run`, verified 2026-03-19 and reverified 2026-03-31; Redis-backed live verify also passed on 2026-03-31 via `output/ops/2026-03-31T08-50-00-phase6-redis-live/summary.json`)
- [x] Scheduled ops wrapper checked (`pnpm ops:gateway:scheduled -- --dry-run`, verified 2026-03-19 and reverified 2026-03-31; Redis-backed live run also passed on 2026-03-31 via `output/ops/manual-phase4/scheduled-live.json`)
- [x] Scheduled notify heartbeat checked (`OPS_NOTIFY_WEBHOOK_URL` receives compact success/failure summaries with threshold reasons and artifact URLs when enabled; verified 2026-03-19 on localhost staging via `output/ops/2026-03-19T17-50-10-local-staging/scheduled-live.json` and `output/ops/2026-03-19T17-50-10-local-staging/webhook-events.jsonl`)
- [x] Gateway runtime smoke checked (`pnpm smoke:gateway-runtime -- --dry-run`, verified 2026-03-19 and reverified 2026-03-31; Redis-backed live run also passed on 2026-03-31 via `output/ops/manual-phase4/smoke-live.json`)
- [x] Gateway backup restore drill checked (`pnpm smoke:gateway-backup-restore -- --dry-run`, verified 2026-03-19 and reverified 2026-03-31; Redis-backed live restore drill also passed on 2026-03-31 via `output/ops/manual-phase4/backup-restore-live.json`)
- [x] Deploy runbook reviewed (`docs/deploy/edgeone.md`, reviewed 2026-03-19)
- [x] Gateway/control-plane image contract reviewed (`ghcr.io/<owner>/geohelper-gateway:staging`, `ghcr.io/<owner>/geohelper-gateway:sha-<shortsha>`, `ghcr.io/<owner>/geohelper-control-plane:staging`, and `ghcr.io/<owner>/geohelper-control-plane:sha-<shortsha>` are the expected release tags)
- [x] OpenClaw extraction rehearsal checked (at least one exported bundle is marked `rehearsedExtractionCandidate`, admin bundle audit output captures `verifyImport`, and any `extractionBlockers` remain visible before portability claims)
- [x] Alert webhook wiring reviewed (gateway 5xx/operator alerts remain routed through the same webhook plumbing; historical live evidence was captured on 2026-03-19 in `output/ops/2026-03-19T17-50-10-local-staging/webhook-events.jsonl`)
- [x] Liveness/readiness contract checked (`/api/v1/health` stays shallow, `/api/v1/ready` is green before traffic switch; verified 2026-03-19 on localhost staging via `output/ops/2026-03-19T17-50-10-local-staging/health.json` and `output/ops/2026-03-19T17-50-10-local-staging/ready.json`)
- [x] Metrics contract checked (`/admin/metrics` returns the runtime-oriented gateway metrics snapshot; verified 2026-03-19 on localhost staging via `output/ops/2026-03-19T17-50-10-local-staging/admin-metrics.json`)
- [x] Attachments contract checked (gateway attachment support is explicit, `/admin/version` reflects `attachments_enabled`, and attachment smoke passed on 2026-03-19 via `output/ops/2026-03-19T17-50-10-local-staging/admin-version.json` and `output/ops/2026-03-19T17-50-10-local-staging/smoke.json`)
- [x] Redis shared-state verified when configured (`REDIS_URL` shares revoke + backup retention; verified 2026-03-31 via `output/ops/manual-phase4/redis-shared-state.json`)
- [x] Template backup recovery checked (export + import preserves `geohelper.templates.snapshot`; verified 2026-03-31 via `pnpm test -- --run apps/web/src/storage/backup.import.test.ts apps/web/src/storage/migrate.test.ts`)
- [x] Gateway backup admin routes checked (`PUT/GET /admin/backups/latest` returns metadata and latest envelope with valid admin token; verified 2026-03-19 on localhost staging and reverified 2026-03-31 via `output/ops/manual-phase4/backup-seed-live.json` plus `output/ops/manual-phase4/backup-restore-live.json`)
- [x] Remote backup settings flow checked (gateway admin token saved, retained history is visible after `检查云端状态`, selected historical snapshots can be fetched by `snapshot_id`, blocked/conflict states point users to explicit pull/import or explicit overwrite, and `检查云端状态` / `上传最新快照` / `拉取最新快照` stay explicit and manual; verified 2026-03-31 via `pnpm test:e2e -- tests/e2e/settings-drawer.backup.spec.ts tests/e2e/settings-drawer.remote-sync.spec.ts tests/e2e/settings-drawer.remote-import.spec.ts tests/e2e/settings-drawer.remote-history.spec.ts tests/e2e/settings-drawer.remote-protection.spec.ts`)
- [x] Protected snapshot policy checked (`BACKUP_MAX_HISTORY` / `BACKUP_MAX_PROTECTED` are configured intentionally, protected snapshots do not auto-expire, limit-full protect returns an explicit failure, and settings protection remains metadata-only; verified 2026-03-31 via `pnpm test -- --run apps/gateway/test/redis-backup-store.protection.test.ts apps/web/src/components/settings-remote-backup-actions.test.ts apps/web/src/components/settings-remote-backup-history.test.ts apps/web/src/components/settings-remote-backup-import.test.ts apps/web/src/components/settings-remote-backup-sync.test.ts` and `pnpm test:e2e -- tests/e2e/settings-drawer.remote-protection.spec.ts`)
