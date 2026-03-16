# Maintainability Baseline

Date: 2026-03-16
Status: Updated after Phase 3 Task 4 settings store extraction

## Budgets

- `maxComponentLines`: `500`
- `maxStoreLines`: `600`
- `maxStyleLines`: `700`

## Wave 2 Guardrails

- `SettingsDrawer.tsx < 1400`
- `WorkspaceShell.tsx < 850`
- `settings-store.ts < 750`
- `chat-store.ts < 700`
- `backup.ts < 450`
- `remote-sync.ts < 320`

## Current Hotspots

Measured after the latest Phase 3 Task 4 update. The default hotspot report remains production-only and excludes `*.test.*` plus `src/test/**` noise unless `--include-tests` is passed explicitly.

- `apps/web/src/styles.css`: `2285` lines
- `apps/web/src/components/SettingsDrawer.tsx`: `927` lines
- `apps/web/src/components/WorkspaceShell.tsx`: `647` lines
- `apps/web/src/state/chat-store.ts`: `642` lines
- `apps/web/src/components/settings-drawer/SettingsDataSection.tsx`: `613` lines
- `apps/web/src/components/CanvasPanel.tsx`: `576` lines

`useRemoteBackupControls.ts`, `settings-remote-backup.ts`, `settings-store.ts`, `backup.ts`, and `remote-sync.ts` are now within their current guardrails. The main active production-code follow-up targets are the stylesheet entrypoint, the two top-level workspace shells, `chat-store.ts`, and the largest residual leaf components.

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
