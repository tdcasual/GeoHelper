# Maintainability Baseline

Date: 2026-03-16
Status: Updated after Phase 3 Task 6 style modularity and guardrail ratchet

## Budgets

- `maxComponentLines`: `500`
- `maxStoreLines`: `600`
- `maxStyleLines`: `700`

## Phase 3 Guardrails

- `SettingsDrawer.tsx < 1400`
- `WorkspaceShell.tsx < 850`
- `useRemoteBackupControls.ts < 500`
- `settings-remote-backup.ts < 120`
- `settings-store.ts < 750`
- `styles.css < 120`
- `chat-store.ts < 700`
- `backup.ts < 450`
- `remote-sync.ts < 320`

## Current Hotspots

Measured after the latest Phase 3 Task 6 update. The default hotspot report remains production-only and excludes `*.test.*` plus `src/test/**` noise unless `--include-tests` is passed explicitly.

- `apps/web/src/components/SettingsDrawer.tsx`: `927` lines
- `apps/web/src/components/WorkspaceShell.tsx`: `647` lines
- `apps/web/src/state/chat-store.ts`: `642` lines
- `apps/web/src/components/settings-drawer/SettingsDataSection.tsx`: `613` lines
- `apps/web/src/components/CanvasPanel.tsx`: `576` lines

## Under-Guardrail Recovery

- `apps/web/src/styles.css`: `6` lines
- `apps/web/src/components/settings-drawer/useRemoteBackupControls.ts`: `459` lines
- `apps/web/src/components/settings-remote-backup.ts`: `4` lines
- `apps/web/src/state/settings-store.ts`: `341` lines

`useRemoteBackupControls.ts`, `settings-remote-backup.ts`, `settings-store.ts`, `styles.css`, `backup.ts`, and `remote-sync.ts` are now within their current guardrails. The active production-code follow-up targets are the two top-level workspace shells, `chat-store.ts`, and the largest residual leaf components that still exceed the hotspot budgets.

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
