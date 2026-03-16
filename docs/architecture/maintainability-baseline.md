# Maintainability Baseline

Date: 2026-03-16
Status: Updated after Phase 2 Task 5 controller extraction

## Budgets

- `maxComponentLines`: `500`
- `maxStoreLines`: `600`
- `maxStyleLines`: `700`

## Wave 2 Guardrails

- `SettingsDrawer.tsx < 1400`
- `WorkspaceShell.tsx < 850`
- `settings-store.ts < 950`
- `chat-store.ts < 700`
- `backup.ts < 450`
- `remote-sync.ts < 320`

## Current Hotspots

Measured after the latest Phase 2 refactor:

- `apps/web/src/components/SettingsDrawer.tsx`: `926` lines
- `apps/web/src/components/WorkspaceShell.tsx`: `646` lines
- `apps/web/src/state/settings-store.ts`: `893` lines
- `apps/web/src/state/chat-store.ts`: `641` lines
- `apps/web/src/styles.css`: `2284` lines

`SettingsDrawer.tsx`, `WorkspaceShell.tsx`, `backup.ts`, and `remote-sync.ts` are now within their Task 6 guardrails. The stricter first-wave category budgets still leave the state stores and stylesheet as active follow-up targets.

## Current Actionable Build Warning

No actionable build warnings detected in the current web build as of 2026-03-16.

Resolved warning signature from the initial baseline:

```text
apps/web/src/storage/backup.ts is dynamically imported by apps/web/src/storage/remote-sync.ts but also statically imported by apps/web/src/components/SettingsDrawer.tsx, dynamic import will not move module into another chunk.
```

## Wave 1 Intent

Wave 1 does not try to eliminate every hotspot immediately. It establishes:

1. repeatable hotspot reporting
2. budget documentation
3. build warning detection
4. CI visibility for maintainability drift
