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
- Control plane: `http://localhost:4310`

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
- optional: `VITE_GATEWAY_URL` (gateway login and backup surface)
- optional: `VITE_CONTROL_PLANE_URL` (platform `/api/v3` and bundle catalog surface; defaults to `VITE_GATEWAY_URL` when omitted)
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
VITE_CONTROL_PLANE_URL=https://<staging-control-plane-domain> \
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

GitHub Actions auto-publishes the gateway and control-plane images to GHCR after successful `main` CI, but web deploy is still intentionally manual.
Deploy web manually from local or your own CI pipeline.

Secrets expected in repo settings:

- `EDGEONE_PROJECT_NAME`
- `EDGEONE_API_TOKEN`
- `STAGING_GATEWAY_URL`
- `STAGING_CONTROL_PLANE_URL`
- Bootstrap helper:

```bash
bash scripts/deploy/configure-release-secrets.sh --repo <owner/repo>
```

## D. Gateway And Control-Plane Staging Deploy

The runtime staging topology is explicit: `web + gateway + control-plane`.

Gateway image:

- image: `ghcr.io/<owner>/geohelper-gateway:staging`
- immutable tag: `ghcr.io/<owner>/geohelper-gateway:sha-<shortsha>`

Control-plane image:

- image: `ghcr.io/<owner>/geohelper-control-plane:staging`
- immutable tag: `ghcr.io/<owner>/geohelper-control-plane:sha-<shortsha>`

Build local staging images from the repo root with:

```bash
pnpm docker:gateway:build
pnpm docker:control-plane:build
```

GitHub Actions auto-publishes both images to GHCR after successful `main` CI using the built-in repository token with `packages: write`.
Gateway runtime deployment remains manual.
control-plane runtime deployment remains manual.

Optional deploy hook secrets:

- `GATEWAY_STAGING_DEPLOY_HOOK_URL`
- `CONTROL_PLANE_STAGING_DEPLOY_HOOK_URL`

## E. Runtime Environment for Gateway

- `PORT`
- `PRESET_TOKEN` (required when Official mode login is enabled)
- `APP_SECRET` (required in production)
- optional: `SESSION_SECRET`
- `SESSION_TTL_SECONDS`
- optional: `REDIS_URL` (recommended for multi-instance shared revoke/backup state)
- optional: `ALERT_WEBHOOK_URL` (receives compact JSON with `traceId`, request path/method, and build identity context on gateway failures)
- optional: `ADMIN_METRICS_TOKEN` (protects `/admin/version`, `/admin/metrics`, and `/admin/backups/*`)
- optional: `BACKUP_MAX_HISTORY` (default `10`, bounds ordinary retained snapshot history)
- optional: `BACKUP_MAX_PROTECTED` (default `20`, bounds retained protected snapshots)
- optional: `GATEWAY_ENABLE_ATTACHMENTS=1` (explicitly enables gateway image attachments; `/admin/version` will then advertise `attachments_enabled: true`)
- optional: `OPS_BENCH_MIN_SUCCESS_RATE`
- optional: `OPS_BENCH_MAX_P95_MS`
- Template file: `.env.release.example`

You can sync gateway/web deploy secrets from local env vars with:

```bash
bash scripts/deploy/configure-release-secrets.sh --repo <owner/repo>
```

Production gateway startup validates `APP_SECRET` before listening. `/api/v1/health` stays liveness-only, while `/api/v1/ready` is the deploy gate that should be green before traffic shifts. When `REDIS_URL` is set, session revoke state and the single-tenant latest backup slot/history are shared across instances. `REDIS_URL` remains the only supported shared fast-state dependency for Gateway V4; without it, backup storage falls back to process memory and is not restart-safe. Every gateway response also includes `x-trace-id` so operator alerts, logs, and smoke runs can correlate the same request. `/admin/version` is the release identity source of truth for deploy drift checks.

Web-side lightweight cloud sync is also available for personal self-hosted deployments, but it remains snapshot-based. Treat metadata-only startup freshness checks as advisory only: the browser does not download full backups during normal startup, delayed upload stays opt-in, and the app never auto-restores remote data. browser sync defaults to guarded writes, force overwrite requires an explicit danger action, and the unconditional admin latest write remains available for operator/manual recovery. Retained remote snapshot history can be inspected explicitly, selected historical snapshots can be fetched by `snapshot_id`, and blocked/conflict states should be resolved through explicit selected-snapshot pull/import or explicit overwrite. No SQL or full cloud history backend is required for this path; the gateway only needs the existing latest-backup surface plus compare metadata.

Self-hosted retention policy:

- ordinary retained history and protected retained snapshots are bounded separately
- `BACKUP_MAX_HISTORY` controls ordinary retained history
- `BACKUP_MAX_PROTECTED` controls protected retained snapshots
- protected snapshots do not auto-expire
- new protect requests fail explicitly when protected capacity is full
- settings-side protect/unprotect is a manual metadata operation that does not imply import or restore

## F. Runtime Environment for Control Plane

- `PORT`
- optional: `GEOHELPER_AGENT_STORE_SQLITE_PATH` (shared durable ledger path for multi-process/local staging setups)

The default image runs the control plane with its inline worker loop enabled. If you split execution onto a standalone worker, point both processes at the same durable agent store before promotion.

## G. Post-deploy Verification

```bash
curl -fsS https://<gateway-domain>/api/v1/health
curl -fsS https://<gateway-domain>/api/v1/ready
curl -fsS https://<control-plane-domain>/api/v3/health
curl -fsS https://<control-plane-domain>/api/v3/ready
```

Use `/api/v1/health` for shallow gateway liveness, `/api/v1/ready` for dependency-aware gateway readiness, `/api/v3/health` for shallow control-plane liveness, and `/api/v3/ready` to confirm the control-plane registry and store are ready before switching traffic.

If `ADMIN_METRICS_TOKEN` is enabled, verify gateway build identity and metrics visibility:

```bash
curl -fsS -H "x-admin-token: <ADMIN_METRICS_TOKEN>" \
  "https://<gateway-domain>/admin/version"

curl -fsS -H "x-admin-token: <ADMIN_METRICS_TOKEN>" \
  "https://<gateway-domain>/admin/metrics"
```

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

Gateway runtime live smoke (recommended after deploy; validates gateway health/auth, control-plane `thread -> run -> stream` surfaces, and `/admin/version` when admin auth is configured). If `/admin/version` advertises `attachments_enabled: true`, the smoke also checks the advertised capability in the smoke output:

```bash
GATEWAY_URL=https://<gateway-domain> \
CONTROL_PLANE_URL=https://<control-plane-domain> \
PRESET_TOKEN=<preset-token> \
ADMIN_METRICS_TOKEN=<admin-token> \
pnpm smoke:gateway-runtime
```

Live platform-run smoke:

```bash
PRESET_TOKEN=<preset-token> \
pnpm smoke:platform-run-live
```

Then open the web staging URL and verify:

- chat panel hide/show works
- runtime switch works (`Gateway` / `Direct BYOK`)
- official mode is available only when gateway runtime is configured
- platform run returns rendered result
- gateway responses include `x-trace-id` for debugging
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
