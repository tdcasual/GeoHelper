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

GitHub Actions auto deploy workflow is intentionally disabled.
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

Gateway staging image/deploy is also manual by design.

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
- optional: `ALERT_WEBHOOK_URL`
- optional: `ADMIN_METRICS_TOKEN` (protects `/admin/metrics` and `/admin/compile-events`)
- optional: `COST_PER_REQUEST_USD`
- Template file: `.env.release.example`

You can sync gateway/web deploy secrets from local env vars with:

```bash
bash scripts/deploy/configure-release-secrets.sh --repo <owner/repo>
```

Production gateway startup validates `APP_SECRET` and `LITELLM_ENDPOINT` before listening. When `REDIS_URL` is set, session revoke and fixed-window rate limits are shared across instances. Every response also includes `x-trace-id` (compile responses include matching `trace_id`).

## F. Post-deploy Verification

```bash
curl -fsS https://<gateway-domain>/api/v1/health
curl -fsS https://<gateway-domain>/api/v1/ready
```

Use `/api/v1/health` for shallow liveness and `/api/v1/ready` for dependency-aware readiness before switching traffic.

If `ADMIN_METRICS_TOKEN` is enabled, verify recent operator events after one smoke compile:

```bash
curl -fsS -H "x-admin-token: <ADMIN_METRICS_TOKEN>" \
  "https://<gateway-domain>/admin/compile-events?limit=20"
```

Verify the self-hosted GeoGebra artifact before release:

```bash
pnpm verify:geogebra-self-hosted
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
- `vendor/geogebra/manifest.json` is present in the deployed static assets
- page resources do not request `geogebra.org`

Quality benchmark dry-run:

```bash
pnpm bench:quality -- --dry-run
```

Use `docs/BETA_CHECKLIST.md` as the final release gate before beta launch.
