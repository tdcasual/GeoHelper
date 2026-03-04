# GeoHelper

GeoHelper is a static-deployable web app that uses LLMs to generate structured GeoGebra commands and render them in the browser.

## Monorepo Structure

- `apps/web`: React + Vite static frontend
- `apps/gateway`: Fastify gateway for token auth and LiteLLM compile endpoint
- `packages/protocol`: shared command schema and types

## Quick Start

```bash
pnpm install
pnpm --filter @geohelper/gateway dev
pnpm --filter @geohelper/web dev
```

Web app: `http://localhost:5173`
Gateway: `http://localhost:8787`

## Test

```bash
pnpm --filter @geohelper/protocol test
pnpm --filter @geohelper/gateway test
pnpm --filter @geohelper/web test
pnpm test:e2e
```

## Deployment

See `docs/deploy/edgeone.md`.
