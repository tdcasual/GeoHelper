# Maintainability Baseline

Date: 2026-03-17
Status: Updated during Phase 7 module maintainability rollout

## Budgets

- `maxComponentLines`: `500`
- `maxStoreLines`: `600`
- `maxModuleLines`: `500`
- `maxStyleLines`: `700`
- `maxTestLines`: `600`

## Guardrails

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
- `backup-import.ts < 450`
- `gateway-client.ts < 500`
- `agent-runs.ts < 500`
- `admin.ts < 500`
- `remote-sync.ts < 320`
- `settings-store.test.ts < 260`
- `backup.test.ts < 260`
- `gateway-client.test.ts < 260`
- `admin-backups.test.ts < 260`
- `redis-backup-store.test.ts < 260`
- `settings-drawer.spec.ts < 260`
- `fullscreen-toggle.spec.ts < 260`

## Current Hotspots

Measured during the Phase 7 module maintainability rollout. The default hotspot report remains production-only, and it now explicitly budgets `runtime` / `storage` / `routes` / `services` source modules as `module`; `--include-tests` still applies an explicit test budget and surfaces oversized suites across app, gateway, and e2e test directories.

- No active production hotspots over budget

Current include-tests hotspots:

- No active include-tests hotspots over budget

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
- `apps/web/src/storage/backup-import.ts`: `158` lines
- `apps/web/src/runtime/gateway-client.ts`: `482` lines
- `apps/gateway/src/routes/agent-runs.ts`: `439` lines
- `apps/gateway/src/routes/admin.ts`: `468` lines
- `apps/gateway/src/services/redis-backup-store.ts`: `444` lines
- `apps/gateway/src/services/backup-store.ts`: `428` lines
- `apps/web/src/storage/migrate.ts`: `372` lines
- `apps/web/src/state/settings-store.test.ts`: `27` lines
- `apps/web/src/storage/backup.test.ts`: `23` lines
- `apps/web/src/runtime/gateway-client.test.ts`: `55` lines
- `apps/gateway/test/admin-backups.test.ts`: `57` lines
- `apps/gateway/test/redis-backup-store.test.ts`: `71` lines
- `tests/e2e/settings-drawer.spec.ts`: `63` lines
- `tests/e2e/settings-drawer.general.spec.ts`: `489` lines
- `tests/e2e/settings-drawer.backup.spec.ts`: `210` lines
- `tests/e2e/settings-drawer.rollback.spec.ts`: `464` lines
- `tests/e2e/settings-drawer.remote-sync.spec.ts`: `538` lines
- `tests/e2e/settings-drawer.remote-import.spec.ts`: `379` lines
- `tests/e2e/settings-drawer.remote-history.spec.ts`: `250` lines
- `tests/e2e/settings-drawer.remote-protection.spec.ts`: `320` lines
- `tests/e2e/fullscreen-toggle.spec.ts`: `77` lines
- `tests/e2e/fullscreen-toggle.desktop.spec.ts`: `230` lines
- `tests/e2e/fullscreen-toggle.mobile-layout.spec.ts`: `275` lines
- `tests/e2e/fullscreen-toggle.mobile-chat.spec.ts`: `276` lines
- `apps/web/src/storage/backup.import.test.ts`: `424` lines
- `apps/web/src/runtime/gateway-client.history.test.ts`: `417` lines

`SettingsDrawer.tsx`, `SettingsDataSection.tsx`, `WorkspaceShell.tsx`, `CanvasPanel.tsx`, `chat-store.ts`, `useRemoteBackupControls.ts`, `settings-remote-backup.ts`, `settings-store.ts`, `styles.css`, `backup.ts`, and `remote-sync.ts` are now within their current guardrails.
`settings-store.test.ts`, `backup.test.ts`, `gateway-client.test.ts`, `admin-backups.test.ts`, `redis-backup-store.test.ts`, `settings-drawer.spec.ts`, and `fullscreen-toggle.spec.ts` are now within the thin-suite test guardrails.
`backup-import.ts`, `gateway-client.ts`, `agent-runs.ts`, `admin.ts`, `redis-backup-store.ts`, `backup-store.ts`, and `migrate.ts` are currently below the new `module` budget but remain close enough to track as recovery candidates.

## Current Actionable Build Warning

No actionable build warnings detected in the current web build as of 2026-03-17.

Resolved warning signature from the initial baseline:

```text
apps/web/src/storage/backup.ts is dynamically imported by apps/web/src/storage/remote-sync.ts but also statically imported by apps/web/src/components/SettingsDrawer.tsx, dynamic import will not move module into another chunk.
```

## Steady State Intent

The current steady state keeps two views in sync:

1. repeatable hotspot reporting
2. budget documentation tied to both production and test maintainability thresholds
3. build warning detection
4. CI visibility for production drift by default and test drift via `--include-tests`
5. production drift visible across UI, state, module, style, and test maintainability budgets
