# GeoHelper

GeoHelper is a static-deployable web app that uses LLMs to generate structured GeoGebra commands and render them in the browser.

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

4. Gateway/Web deploy is manual by design (no auto deploy workflow).

Notes:

- `geogebra:sync` tries the official latest bundle first and falls back to the configured fallback or cached last-known-good when needed.
- `VITE_GATEWAY_URL` is optional for pure Direct BYOK mode.
- If `VITE_GATEWAY_URL` is unset, web defaults to `Direct BYOK` runtime and Official mode is unavailable until a Gateway runtime is configured in settings.
- Production gateway startup requires explicit `APP_SECRET` and `LITELLM_ENDPOINT`; development keeps local defaults for convenience.
- `REDIS_URL` is recommended when running multiple gateway instances so session revoke, rate-limit state, and latest backup retention stay shared.
- Gateway operators can push/pull the latest single-tenant backup through `/admin/backups/latest` with `x-admin-token` when remote recovery is needed.
- Optional upstream fallback envs `LITELLM_FALLBACK_ENDPOINT`, `LITELLM_FALLBACK_API_KEY`, and `LITELLM_FALLBACK_MODEL` let Gateway retry transient model failures against a secondary provider.
- `PRESET_TOKEN` is required only when you intend to expose `Official` mode login.

## Gateway Container Build

Build the self-hosted gateway image from the repo root:

```bash
pnpm docker:gateway:build
```

The image starts the Fastify gateway on `PORT=8787`, only includes the gateway workspace plus shared protocol sources, and embeds `GEOHELPER_BUILD_SHA` / `GEOHELPER_BUILD_TIME` for `/admin/version`.

## Gateway Runtime Smoke

Dry-run the ordered verification plan without network calls:

```bash
pnpm smoke:gateway-runtime -- --dry-run
```

Run it against a live gateway. The smoke now validates `/admin/version`, one compile request, trace visibility in `/admin/compile-events`, and post-compile totals in `/admin/metrics` when `ADMIN_METRICS_TOKEN` is present:

```bash
GATEWAY_URL=https://<gateway-domain> \
PRESET_TOKEN=<preset-token> \
ADMIN_METRICS_TOKEN=<admin-token> \
pnpm smoke:gateway-runtime
```

Alert webhooks sent via `ALERT_WEBHOOK_URL` now include `traceId`, `finalStatus`, runtime build identity, and non-secret upstream endpoint/model metadata for fallback, repair, timeout, and operator-failure cases.

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
Settings backup/recovery guide: `docs/user/settings-backup-recovery.md`.
