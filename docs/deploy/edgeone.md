# GeoHelper Deployment (Staging + EdgeOne)

## A. Local Staging Environment (recommended before remote deploy)

Start local staging stack:

```bash
bash scripts/deploy/staging-up.sh
```

The script auto-selects mode:

- Docker compose mode (if Docker daemon is available)
- Local process fallback mode (if Docker is unavailable)

Endpoints:

- Web: `http://localhost:4173`
- Gateway: `http://localhost:8787`

Stop stack:

```bash
bash scripts/deploy/staging-down.sh
```

## B. GeoGebra Vendor Sync (required before web build)

The web app now self-hosts GeoGebra assets. Before any staging or production web build, run:

```bash
pnpm geogebra:sync
```

What this does:

- resolves the official latest GeoGebra Math Apps Bundle
- downloads and validates the bundle locally
- falls back to the configured fallback version if latest fails
- falls back again to cached last-known-good if fallback is unavailable
- publishes the resolved bundle into `apps/web/public/vendor/geogebra/current/`
- writes vendor metadata to `apps/web/public/vendor/geogebra/manifest.json`

Operational notes:

- `latest` is preferred on every sync attempt
- `fallback` is used only when latest download, extraction, or validation fails
- `last-known-good` is used only when both latest and fallback fail
- production should serve GeoGebra only from local static assets, not `geogebra.org`

## C. EdgeOne Staging Deploy (Web)

Required env vars:

- `EDGEONE_PROJECT_NAME`
- `EDGEONE_API_TOKEN`
- optional: `VITE_GATEWAY_URL` (when omitted, web runs in Direct BYOK-first mode)
- optional: `EDGEONE_ENVIRONMENT` (default `preview`)
- Template file: `.env.release.example`

Deploy command:

```bash
pnpm geogebra:sync
pnpm --filter @geohelper/web build
pnpm verify:geogebra-self-hosted
EDGEONE_PROJECT_NAME=<project> \
EDGEONE_API_TOKEN=<token> \
VITE_GATEWAY_URL=https://<staging-gateway-domain> \
bash scripts/deploy/edgeone-deploy.sh
```

Direct BYOK-only deploy (no gateway URL at build time):

```bash
pnpm geogebra:sync
pnpm --filter @geohelper/web build
pnpm verify:geogebra-self-hosted
EDGEONE_PROJECT_NAME=<project> \
EDGEONE_API_TOKEN=<token> \
bash scripts/deploy/edgeone-deploy.sh
```

GitHub Actions auto-publishes the gateway image to GHCR after successful `main` CI, but web deploy is still intentionally manual.
Deploy web manually from local or your own CI pipeline.

Secrets expected in repo settings:

- `EDGEONE_PROJECT_NAME`
- `EDGEONE_API_TOKEN`
- `STAGING_GATEWAY_URL`
- Bootstrap helper:

```bash
bash scripts/deploy/configure-release-secrets.sh --repo <owner/repo>
```

## D. Gateway Staging Deploy

Gateway is packaged as container image:

- image: `ghcr.io/<owner>/geohelper-gateway:staging`
- immutable tag: `ghcr.io/<owner>/geohelper-gateway:sha-<shortsha>`

Build a local staging image from the repo root with:

```bash
pnpm docker:gateway:build
```

GitHub Actions auto-publishes the gateway image to GHCR after successful `main` CI using the built-in repository token with `packages: write`.
Gateway runtime deployment remains manual.

Optional deploy hook secret:

- `GATEWAY_STAGING_DEPLOY_HOOK_URL`

## E. Runtime Environment for Gateway

- `PORT`
- `PRESET_TOKEN` (required when Official mode login is enabled)
- `APP_SECRET` (required in production)
- optional: `SESSION_SECRET`
- `SESSION_TTL_SECONDS`
- `LITELLM_ENDPOINT` (required in production)
- `LITELLM_API_KEY` (required for authenticated upstreams)
- `LITELLM_MODEL`
- optional: `LITELLM_FALLBACK_ENDPOINT`
- optional: `LITELLM_FALLBACK_API_KEY`
- optional: `LITELLM_FALLBACK_MODEL`
- `RATE_LIMIT_MAX`
- `RATE_LIMIT_WINDOW_MS`
- optional: `REDIS_URL` (recommended for multi-instance shared revoke/rate-limit state)
- optional: `ALERT_WEBHOOK_URL` (receives compact JSON with `traceId`, `finalStatus`, build identity, and redacted upstream target metadata)
- optional: `COMPILE_MAX_IN_FLIGHT` (default `4`)
- optional: `COMPILE_TIMEOUT_MS` (default `30000`)
- optional: `ADMIN_METRICS_TOKEN` (protects `/admin/version`, `/admin/metrics`, and `/admin/compile-events`)
- optional: `BACKUP_MAX_HISTORY` (default `10`, bounds ordinary retained snapshot history)
- optional: `BACKUP_MAX_PROTECTED` (default `20`, bounds retained protected snapshots)
- optional: `GATEWAY_ENABLE_ATTACHMENTS=1` (explicitly enables gateway image attachments; `/admin/version` will then advertise `attachments_enabled: true`)
- optional: `COST_PER_REQUEST_USD`
- optional: `OPS_BENCH_MIN_SUCCESS_RATE`
- optional: `OPS_BENCH_MAX_P95_MS`
- Template file: `.env.release.example`

You can sync gateway/web deploy secrets from local env vars with:

```bash
bash scripts/deploy/configure-release-secrets.sh --repo <owner/repo>
```

Production gateway startup validates `APP_SECRET` and `LITELLM_ENDPOINT` before listening. `/api/v1/health` stays liveness-only, while `/api/v1/ready` is the deploy gate that should be green before traffic shifts. When `REDIS_URL` is set, session revoke, fixed-window rate limits, compile event retention, and the single-tenant latest backup slot/history are shared across instances. `REDIS_URL` remains the only supported shared fast-state dependency for Gateway V4; without it, backup storage falls back to process memory and is not restart-safe. Every response also includes `x-trace-id` (compile responses include matching `trace_id`) so operator alerts, smoke runs, `/admin/compile-events`, and `/admin/traces/:traceId` can be joined on the same trace handle. `/admin/version` is the release identity source of truth for deploy drift checks. Per-instance compile protection is controlled by `COMPILE_MAX_IN_FLIGHT` and `COMPILE_TIMEOUT_MS`, returning `GATEWAY_BUSY` or `COMPILE_TIMEOUT` before a stuck upstream can monopolize the runtime.

Web-side lightweight cloud sync is also available for personal self-hosted deployments, but it remains snapshot-based. Treat metadata-only startup freshness checks as advisory only: the browser does not download full backups during normal startup, delayed upload stays opt-in, and the app never auto-restores remote data. browser sync defaults to guarded writes, force overwrite requires an explicit danger action, and the unconditional admin latest write remains available for operator/manual recovery. Retained remote snapshot history can be inspected explicitly, selected historical snapshots can be fetched by `snapshot_id`, and blocked/conflict states should be resolved through explicit selected-snapshot pull/import or explicit overwrite. No SQL or full cloud history backend is required for this path; the gateway only needs the existing latest-backup surface plus compare metadata.

Self-hosted retention policy:

- ordinary retained history and protected retained snapshots are bounded separately
- `BACKUP_MAX_HISTORY` controls ordinary retained history
- `BACKUP_MAX_PROTECTED` controls protected retained snapshots
- protected snapshots do not auto-expire
- new protect requests fail explicitly when protected capacity is full
- settings-side protect/unprotect is a manual metadata operation that does not imply import or restore

## F. Post-deploy Verification

```bash
curl -fsS https://<gateway-domain>/api/v1/health
curl -fsS https://<gateway-domain>/api/v1/ready
```

Use `/api/v1/health` for shallow liveness and `/api/v1/ready` for dependency-aware readiness before switching traffic.

If `ADMIN_METRICS_TOKEN` is enabled, verify recent operator events after one smoke compile and use returned trace ids to jump into logs quickly. With `REDIS_URL` configured, these records should also survive gateway restarts:

```bash
curl -fsS -H "x-admin-token: <ADMIN_METRICS_TOKEN>" \
  "https://<gateway-domain>/admin/compile-events?limit=20"
```

Use a trace id from that feed to inspect the full operator event timeline for one compile:

```bash
curl -fsS -H "x-admin-token: <ADMIN_METRICS_TOKEN>" \
  "https://<gateway-domain>/admin/traces/<trace-id>"
```

If you are preparing the final retirement of `POST /api/v1/chat/compile`, run the dedicated external-consumer checklist before removing the route:

- `docs/deploy/legacy-compile-external-consumer-checklist.md`

Verify the running gateway build identity when investigating deploy drift:

```bash
curl -fsS -H "x-admin-token: <ADMIN_METRICS_TOKEN>" \
  "https://<gateway-domain>/admin/version"
```

Push one exported app backup into gateway and verify the latest remote snapshot is readable back with metadata:

```bash
curl -fsS -X PUT \
  -H "x-admin-token: <ADMIN_METRICS_TOKEN>" \
  -H "content-type: application/json" \
  --data @geochat-backup.json \
  "https://<gateway-domain>/admin/backups/latest"

curl -fsS -H "x-admin-token: <ADMIN_METRICS_TOKEN>" \
  "https://<gateway-domain>/admin/backups/latest"

Inspect retained remote snapshot history and fetch one selected historical snapshot by `snapshot_id` when resolving blocked/conflicted browser sync:

```bash
curl -fsS -H "x-admin-token: <ADMIN_METRICS_TOKEN>" \
  "https://<gateway-domain>/admin/backups/history?limit=5"

curl -fsS -H "x-admin-token: <ADMIN_METRICS_TOKEN>" \
  "https://<gateway-domain>/admin/backups/history/<snapshot-id>"
```

Protect or unprotect one selected retained snapshot explicitly:

```bash
curl -fsS -X POST \
  -H "x-admin-token: <ADMIN_METRICS_TOKEN>" \
  "https://<gateway-domain>/admin/backups/history/<snapshot-id>/protect"

curl -fsS -X DELETE \
  -H "x-admin-token: <ADMIN_METRICS_TOKEN>" \
  "https://<gateway-domain>/admin/backups/history/<snapshot-id>/protect"
```

Gateway backup restore drill dry-run (no network calls):

```bash
pnpm smoke:gateway-backup-restore -- --dry-run
```

Gateway backup restore drill live run (recommended after backup upload; validates the envelope with the shared protocol helper and prints compact restore metadata only):

```bash
GATEWAY_URL=https://<gateway-domain> \
ADMIN_METRICS_TOKEN=<admin-token> \
pnpm smoke:gateway-backup-restore
```

Verify the self-hosted GeoGebra artifact before release:

```bash
pnpm verify:geogebra-self-hosted
```

Gateway runtime smoke dry-run (no network calls):

```bash
pnpm smoke:gateway-runtime -- --dry-run
```

Simulate an attachment-capable gateway in dry-run output:

```bash
ADMIN_METRICS_TOKEN=<admin-token> \
SMOKE_GATEWAY_IDENTITY_JSON='{"attachments_enabled":true}' \
pnpm smoke:gateway-runtime -- --dry-run
```

Gateway runtime live smoke (recommended after deploy; validates `/admin/version`, one compile trace, `/admin/compile-events`, and `/admin/metrics` when admin auth is configured). If `/admin/version` advertises `attachments_enabled: true`, the smoke also runs one synthetic attachment compile and that vision smoke becomes a release gate for image-input deployments:

```bash
GATEWAY_URL=https://<gateway-domain> \
PRESET_TOKEN=<preset-token> \
ADMIN_METRICS_TOKEN=<admin-token> \
pnpm smoke:gateway-runtime
```

Live model smoke (requires real LiteLLM credentials):

```bash
LITELLM_ENDPOINT=<endpoint> \
LITELLM_API_KEY=<key> \
PRESET_TOKEN=<preset-token> \
pnpm smoke:live-model
```

Then open the web staging URL and verify:

- chat panel hide/show works
- runtime switch works (`Gateway` / `Direct BYOK`)
- official mode is available only when gateway runtime is configured
- compile pipeline returns rendered result
- compile responses include `x-trace-id` / `trace_id` for debugging
- lightweight cloud sync settings stay snapshot-based, metadata-only startup freshness checks do not trigger full restore, browser sync defaults to guarded writes, force overwrite requires an explicit danger action, and delayed upload never auto-restores
- `vendor/geogebra/manifest.json` is present in the deployed static assets
- page resources do not request `geogebra.org`

Quality benchmark dry-run:

```bash
pnpm bench:quality -- --dry-run
```

Gateway ops verify dry-run (smoke + benchmark plan only):

```bash
pnpm ops:gateway:verify -- --dry-run
```

Gateway ops verify live run (recommended after deploy):

```bash
GATEWAY_URL=https://<gateway-domain> \
pnpm ops:gateway:verify
```

Live runs persist JSON artifacts under `output/ops/<timestamp>/`. When `OPS_BENCH_MIN_SUCCESS_RATE` or `OPS_BENCH_MAX_P95_MS` is configured, a threshold breach exits non-zero and should block release promotion until resolved.

Scheduler-facing wrapper dry-run:

```bash
OPS_RUN_LABEL=nightly-<date> \
OPS_DEPLOYMENT=staging \
pnpm ops:gateway:scheduled -- --dry-run
```

Use `ops:gateway:scheduled` as the stable recurring command for external cron platforms; the wrapper composes verify, artifact publish, and notify phases behind one entrypoint. Published artifact URLs from scheduled runs should be treated as the post-deploy evidence source of truth.

Artifact publish envs for S3-compatible storage:

- `OPS_ARTIFACT_BUCKET`
- `OPS_ARTIFACT_PREFIX`
- `OPS_ARTIFACT_REGION`
- `OPS_ARTIFACT_ENDPOINT`
- `OPS_ARTIFACT_ACCESS_KEY_ID`
- `OPS_ARTIFACT_SECRET_ACCESS_KEY`
- `OPS_ARTIFACT_PUBLIC_BASE_URL`
- `OPS_NOTIFY_WEBHOOK_URL`

When notify is enabled, the scheduled wrapper emits one compact JSON heartbeat/failure summary per run with `run_label`, `deployment`, `status`, threshold `failure_reasons`, and artifact URLs when publish is enabled. A failed restore drill should block release promotion alongside smoke/benchmark threshold failures.

The web `设置` drawer exposes opt-in remote backup controls (`上传到网关`, `从网关拉取`, `拉取后导入`) only after a gateway admin token is saved locally. There is no automatic polling or background sync in this phase.


Use `docs/BETA_CHECKLIST.md` as the final release gate before beta launch.
