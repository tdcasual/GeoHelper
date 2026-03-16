# Maintainability Baseline

Date: 2026-03-16
Status: Updated after Phase 4 guardrail ratchet

## Budgets

- `maxComponentLines`: `500`
- `maxStoreLines`: `600`
- `maxStyleLines`: `700`

## Phase 4 Guardrails

- `SettingsDrawer.tsx < 500`
- `SettingsDataSection.tsx < 400`
- `WorkspaceShell.tsx < 500`
- `CanvasPanel.tsx < 400`
- `useRemoteBackupControls.ts < 500`
- `settings-remote-backup.ts < 120`
- `settings-store.ts < 750`
- `styles.css < 120`
- `chat-store.ts < 500`
- `backup.ts < 450`
- `remote-sync.ts < 320`

## Current Hotspots

Measured after the Phase 4 maintainability cleanup. The default hotspot report remains production-only and excludes `*.test.*` plus `src/test/**` noise unless `--include-tests` is passed explicitly.

- No active production hotspots over budget

## Under-Guardrail Recovery

- `apps/web/src/components/SettingsDrawer.tsx`: `417` lines
- `apps/web/src/components/settings-drawer/SettingsDataSection.tsx`: `115` lines
- `apps/web/src/components/WorkspaceShell.tsx`: `484` lines
- `apps/web/src/components/CanvasPanel.tsx`: `394` lines
- `apps/web/src/state/chat-store.ts`: `218` lines
- `apps/web/src/styles.css`: `6` lines
- `apps/web/src/components/settings-drawer/useRemoteBackupControls.ts`: `459` lines
- `apps/web/src/components/settings-remote-backup.ts`: `4` lines
- `apps/web/src/state/settings-store.ts`: `341` lines

`SettingsDrawer.tsx`, `SettingsDataSection.tsx`, `WorkspaceShell.tsx`, `CanvasPanel.tsx`, `chat-store.ts`, `useRemoteBackupControls.ts`, `settings-remote-backup.ts`, `settings-store.ts`, `styles.css`, `backup.ts`, and `remote-sync.ts` are now within their current guardrails.

## Current Actionable Build Warning

No actionable build warnings detected in the current web build as of 2026-03-16.

Resolved warning signature from the initial baseline:

```text
apps/web/src/storage/backup.ts is dynamically imported by apps/web/src/storage/remote-sync.ts but also statically imported by apps/web/src/components/SettingsDrawer.tsx, dynamic import will not move module into another chunk.
```

## Steady State Intent

Phase 4 establishes the current steady state:

1. repeatable hotspot reporting
2. budget documentation tied to current production files
3. build warning detection
4. CI visibility for maintainability drift
5. no active production hotspots over budget by default
