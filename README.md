# GeoHelper

GeoHelper is a static-deployable, teacher-first diagram studio that uses LLMs to generate structured GeoGebra commands, review geometry drafts, and render them in the browser.

## Monorepo Structure

- `apps/web`: React + Vite static frontend
- `apps/gateway`: Fastify gateway for auth, multi-agent compile orchestration, and LiteLLM routing
- `packages/protocol`: shared command schema and types

## Quick Start

```bash
pnpm install
pnpm --filter @geohelper/gateway dev
pnpm geogebra:sync
pnpm --filter @geohelper/web dev
```

- Web: `http://localhost:5173`
- Gateway: `http://localhost:8787`
- GeoGebra web assets are served locally from `apps/web/public/vendor/geogebra/current/`
- Vendor metadata is generated at `apps/web/public/vendor/geogebra/manifest.json`

## API Contract

Runtime compile traffic should call `POST /api/v2/agent/runs`, which is documented in [`docs/api/m0-m1-contract.md`](docs/api/m0-m1-contract.md) and describes the `AgentRun` workflow used by the gateway today. The legacy `POST /api/v1/chat/compile` route has been removed from the active runtime.

## Tests

```bash
pnpm --filter @geohelper/protocol test
pnpm --filter @geohelper/gateway test
pnpm --filter @geohelper/web test
pnpm test:e2e
```

## Staging Deploy

1. Start local staging stack:

```bash
bash scripts/deploy/staging-up.sh
```

2. Sync the latest self-hosted GeoGebra bundle before building web assets:

```bash
pnpm geogebra:sync
```

3. Deploy web to EdgeOne preview:

```bash
EDGEONE_PROJECT_NAME=<project> EDGEONE_API_TOKEN=<token> VITE_GATEWAY_URL=https://<staging-gateway> bash scripts/deploy/edgeone-deploy.sh
```

4. Web deploy and gateway runtime deployment remain manual by design. GitHub Actions auto-publishes the gateway image to GHCR after successful `main` CI.

Notes:

- `geogebra:sync` tries the official latest bundle first and falls back to the configured fallback or cached last-known-good when needed.
- `VITE_GATEWAY_URL` is optional for pure Direct BYOK mode.
- If `VITE_GATEWAY_URL` is unset, web defaults to `Direct BYOK` runtime and Official mode is unavailable until a Gateway runtime is configured in settings.
- Production gateway startup requires explicit `APP_SECRET` and `LITELLM_ENDPOINT`; development keeps local defaults for convenience.
- `REDIS_URL` is recommended when running multiple gateway instances so session revoke, rate-limit state, and latest backup retention stay shared.
- Gateway operators can push/pull the latest single-tenant backup through `/admin/backups/latest` with `x-admin-token` when remote recovery is needed.
- Optional upstream fallback envs `LITELLM_FALLBACK_ENDPOINT`, `LITELLM_FALLBACK_API_KEY`, and `LITELLM_FALLBACK_MODEL` let Gateway retry transient model failures against a secondary provider.
- `GATEWAY_ENABLE_ATTACHMENTS=1` explicitly enables gateway image attachments; direct runtime and gateway runtime can legitimately differ in vision support.
- `PRESET_TOKEN` is required only when you intend to expose `Official` mode login.
- GitHub Actions auto-publishes the gateway image to GHCR as `ghcr.io/<owner>/geohelper-gateway:staging` and `ghcr.io/<owner>/geohelper-gateway:sha-<shortsha>`.
- The gateway runtime deployment remains manual even though image publishing is automated.

## Gateway Container Build

Build the self-hosted gateway image from the repo root:

```bash
pnpm docker:gateway:build
```

The image starts the Fastify gateway on `PORT=8787`, only includes the gateway workspace plus shared protocol sources, and embeds `GEOHELPER_BUILD_SHA` / `GEOHELPER_BUILD_TIME` for `/admin/version`.
Successful `main` CI also publishes the same image contract to GHCR automatically.

## Gateway Runtime Smoke

Dry-run the ordered verification plan without network calls:

```bash
pnpm smoke:gateway-runtime -- --dry-run
```

Simulate an attachment-capable gateway in dry-run output:

```bash
ADMIN_METRICS_TOKEN=<admin-token> \
SMOKE_GATEWAY_IDENTITY_JSON='{"attachments_enabled":true}' \
pnpm smoke:gateway-runtime -- --dry-run
```

Run it against a live gateway. The smoke now validates `/admin/version`, one compile request, trace visibility in `/admin/compile-events`, and post-compile totals in `/admin/metrics` when `ADMIN_METRICS_TOKEN` is present. If `/admin/version` advertises `attachments_enabled: true`, it automatically adds one attachment-bearing compile check with a synthetic in-memory PNG payload:

```bash
GATEWAY_URL=https://<gateway-domain> \
PRESET_TOKEN=<preset-token> \
ADMIN_METRICS_TOKEN=<admin-token> \
pnpm smoke:gateway-runtime
```

Alert webhooks sent via `ALERT_WEBHOOK_URL` now include `traceId`, `finalStatus`, runtime build identity, and non-secret upstream endpoint/model metadata for fallback, repair, timeout, and operator-failure cases.

Gateway backup restore drill dry-run:

```bash
pnpm smoke:gateway-backup-restore -- --dry-run
```

Run the restore drill against a live gateway to validate the latest remote backup envelope and print compact recovery metadata without mutating browser state:

```bash
GATEWAY_URL=https://<gateway-domain> \
ADMIN_METRICS_TOKEN=<admin-token> \
pnpm smoke:gateway-backup-restore
```

Remote backup UI stays opt-in in `设置` -> `数据与安全` -> `网关远端备份`. GeoHelper now exposes lightweight cloud sync, but the contract remains snapshot-based rather than full cloud chat sync. Startup freshness checks stay metadata-only, delayed upload is opt-in, and the browser never auto-restores remote data. This route does not require SQL or a full cloud history backend: the browser remains local-first while the gateway stores the latest validated snapshot plus compact compare metadata. Retained remote snapshot history can be inspected explicitly, users can fetch a selected historical snapshot by `snapshot_id`, and both the selected history entry and the history list now show a preflight relation against the current local snapshot before pull/import. After a pull, the preview panel also shows whether the pulled result came from the latest or one selected historical snapshot, plus relation-aware import guidance before merge/replace; if the user changes the selected historical snapshot after pulling, GeoHelper now marks the pulled preview stale and blocks import until that newly selected snapshot is pulled again. The pulled preview now also includes conversation-level merge/replace impact counts so users can estimate how many conversations would be added, updated, kept local, or replaced before importing. Dangerous replace imports now require an explicit second click in both local backup import and pulled-remote preview flows, so overwrite actions cannot fire on the first click by accident. Manual imports now also create one browser-local rollback anchor before mutating local state, record the post-import outcome summary after success, and show whether the current browser conversations still match that imported result before you roll back. Blocked/conflicted sync states should be resolved through explicit selected-snapshot pull/import or explicit overwrite. browser sync defaults to guarded writes, force overwrite requires an explicit danger action, and the unconditional admin latest route stays available for operator/manual tooling compatibility. Operators must save a gateway admin token before `检查云端状态`, `上传最新快照`, or `拉取最新快照` becomes available, and every remote import remains manual.

For self-hosted retention, ordinary retained history and protected retained snapshots are bounded separately. Configure `BACKUP_MAX_HISTORY` for ordinary retained history and `BACKUP_MAX_PROTECTED` for protected retained snapshots. protected snapshots do not auto-expire, new protect requests fail explicitly when protected capacity is full, and the settings-side `保护此快照` / `取消保护` flow is a manual metadata operation that does not imply import or restore.

Scheduled operator wrapper dry-run:

```bash
pnpm ops:gateway:scheduled -- --dry-run
```

Use this wrapper as the scheduler-facing recurring entrypoint for external cron platforms; artifact publish and compact webhook heartbeat/failure summaries are controlled through env vars without changing the cron command itself. Published artifact URLs from scheduled runs become the post-deploy evidence source of truth, and release promotion should stop when threshold checks or the gateway backup restore drill fail.

## Live Model Smoke

```bash
LITELLM_ENDPOINT=<endpoint> LITELLM_API_KEY=<key> PRESET_TOKEN=<preset-token> pnpm smoke:live-model
```

## Quality Benchmark

```bash
pnpm bench:quality -- --dry-run
```

Run against a live gateway:

```bash
GATEWAY_URL=http://127.0.0.1:8787 pnpm bench:quality
```

See deployment details: `docs/deploy/edgeone.md`.
Beta release checklist: `docs/BETA_CHECKLIST.md`.
Backend roadmap index: `docs/plans/README.md`.
Settings backup/recovery guide: `docs/user/settings-backup-recovery.md`.
