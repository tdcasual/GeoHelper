# GeoHelper on EdgeOne (Static Deployment)

This project deploys the frontend as static assets to Tencent EdgeOne.

## 1. Build static assets

Run:

```bash
pnpm install
pnpm --filter @geohelper/web build
```

Output directory:

- `apps/web/dist`

## 2. Configure EdgeOne site

1. Create a static site in EdgeOne.
2. Upload `apps/web/dist` as the publish directory.
3. Set SPA fallback to `index.html`.

## 3. Runtime environment

For frontend:

- `VITE_GATEWAY_URL` = your gateway base URL (for example `https://api.example.com`)

For gateway (separate deployment target):

- `PRESET_TOKEN`
- `SESSION_SECRET`
- `LITELLM_ENDPOINT`
- `LITELLM_API_KEY`
- `LITELLM_MODEL` (optional)

## 4. Local verification before deploy

```bash
pnpm --filter @geohelper/web build
pnpm --filter @geohelper/web preview
```

Then open `http://localhost:4173` and verify:

- chat panel hide/show works
- canvas is full-screen when chat hidden
- byok/official mode switch works
