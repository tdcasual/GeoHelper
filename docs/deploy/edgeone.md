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

## B. EdgeOne Staging Deploy (Web)

Required env vars:

- `EDGEONE_PROJECT_NAME`
- `EDGEONE_API_TOKEN`
- `VITE_GATEWAY_URL`
- optional: `EDGEONE_ENVIRONMENT` (default `preview`)
- Template file: `.env.release.example`

Deploy command:

```bash
pnpm --filter @geohelper/web build
EDGEONE_PROJECT_NAME=<project> \
EDGEONE_API_TOKEN=<token> \
VITE_GATEWAY_URL=https://<staging-gateway-domain> \
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

## C. Gateway Staging Deploy

Gateway is packaged as container image:

- image: `ghcr.io/<owner>/geohelper-gateway:staging`

Gateway staging image/deploy is also manual by design.

Optional deploy hook secret:

- `GATEWAY_STAGING_DEPLOY_HOOK_URL`

## D. Runtime Environment for Gateway

- `PORT`
- `PRESET_TOKEN`
- `APP_SECRET`
- optional: `SESSION_SECRET`
- `SESSION_TTL_SECONDS`
- `LITELLM_ENDPOINT`
- `LITELLM_API_KEY`
- `LITELLM_MODEL`
- `RATE_LIMIT_MAX`
- `RATE_LIMIT_WINDOW_MS`
- optional: `ALERT_WEBHOOK_URL`
- optional: `ADMIN_METRICS_TOKEN`
- optional: `COST_PER_REQUEST_USD`
- Template file: `.env.release.example`

You can sync gateway/web deploy secrets from local env vars with:

```bash
bash scripts/deploy/configure-release-secrets.sh --repo <owner/repo>
```

## E. Post-deploy Verification

```bash
curl -fsS https://<gateway-domain>/api/v1/health
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
- official/byok mode switch works
- compile pipeline returns rendered result

Quality benchmark dry-run:

```bash
pnpm bench:quality -- --dry-run
```

Use `docs/BETA_CHECKLIST.md` as the final release gate before beta launch.
