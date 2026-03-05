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
pnpm --filter @geohelper/web dev
```

- Web: `http://localhost:5173`
- Gateway: `http://localhost:8787`

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

2. Deploy web to EdgeOne preview:

```bash
EDGEONE_PROJECT_NAME=<project> EDGEONE_API_TOKEN=<token> VITE_GATEWAY_URL=https://<staging-gateway> bash scripts/deploy/edgeone-deploy.sh
```

3. Gateway/Web deploy is manual by design (no auto deploy workflow).

Notes:

- `VITE_GATEWAY_URL` is optional for pure Direct BYOK mode.
- If `VITE_GATEWAY_URL` is unset, web defaults to `Direct BYOK` runtime and Official mode is unavailable until a Gateway runtime is configured in settings.

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
