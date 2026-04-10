# Maintainability Baseline

Date: 2026-04-04
Status: Updated for the platform run cutover

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
- `control-plane-client.ts < 200`
- `platform-runner.ts < 200`
- `runs.ts < 200`
- `admin-runs.ts < 200`
- `admin.ts < 500`
- `remote-sync.ts < 320`
- `settings-store.test.ts < 260`
- `backup.test.ts < 260`
- `browser-bridge.test.ts < 260`
- `admin-backups.test.ts < 260`
- `redis-backup-store.test.ts < 260`
- `settings-drawer.spec.ts < 260`
- `fullscreen-toggle.spec.ts < 260`

## Current Hotspots

The default hotspot report remains production-only, and `--include-tests` applies the same budget model to app, gateway, workspace, and e2e suites.

- No active production hotspots over budget

Current include-tests hotspots:

- No active include-tests hotspots over budget

Scenario-suite exclusions from include-tests hotspot reporting:

- `apps/control-plane/test/delegation-sessions-route.test.ts`
- `apps/worker/test/run-loop.test.ts`
- `apps/worker/test/run-loop-subagent.test.ts`
- `packages/agent-store/test/run-store.test.ts`

## Under-Guardrail Recovery

- `apps/web/src/components/SettingsDrawer.tsx`: `417` lines
- `apps/web/src/components/settings-drawer/SettingsDataSection.tsx`: `115` lines
- `apps/web/src/components/WorkspaceShell.tsx`: `361` lines
- `apps/web/src/components/CanvasPanel.tsx`: `392` lines
- `apps/web/src/state/chat-store.ts`: `247` lines
- `apps/web/src/styles.css`: `7` lines
- `apps/web/src/components/settings-drawer/useRemoteBackupControls.ts`: `459` lines
- `apps/web/src/components/settings-remote-backup.ts`: `4` lines
- `apps/web/src/state/settings-store.ts`: `338` lines
- `apps/web/src/storage/backup.ts`: `253` lines
- `apps/web/src/storage/backup-import.ts`: `158` lines
- `apps/web/src/storage/remote-sync.ts`: `273` lines
- `apps/web/src/runtime/control-plane-client.ts`: `114` lines
- `apps/web/src/runtime/platform-runner.ts`: `57` lines
- `apps/control-plane/src/routes/runs.ts`: `60` lines
- `apps/control-plane/src/routes/admin-runs.ts`: `46` lines
- `apps/gateway/src/routes/admin.ts`: `403` lines
- `apps/gateway/src/services/redis-backup-store.ts`: `444` lines
- `apps/gateway/src/services/backup-store.ts`: `428` lines
- `apps/web/src/storage/migrate.ts`: `372` lines
- `apps/web/src/state/settings-store.test.ts`: `27` lines
- `apps/web/src/storage/backup.test.ts`: `23` lines
- `apps/web/src/runtime/browser-bridge.test.ts`: `117` lines
- `apps/gateway/test/admin-backups.test.ts`: `57` lines
- `apps/gateway/test/redis-backup-store.test.ts`: `71` lines
- `tests/e2e/settings-drawer.spec.ts`: `63` lines
- `tests/e2e/settings-drawer.backup.spec.ts`: `210` lines
- `tests/e2e/settings-drawer.rollback.spec.ts`: `464` lines
- `tests/e2e/settings-drawer.remote-sync.spec.ts`: `538` lines
- `tests/e2e/settings-drawer.remote-import.spec.ts`: `378` lines
- `tests/e2e/settings-drawer.remote-history.spec.ts`: `250` lines
- `tests/e2e/settings-drawer.remote-protection.spec.ts`: `320` lines
- `tests/e2e/fullscreen-toggle.spec.ts`: `77` lines
- `tests/e2e/fullscreen-toggle.desktop.spec.ts`: `230` lines
- `tests/e2e/fullscreen-toggle.mobile-layout.spec.ts`: `275` lines
- `tests/e2e/fullscreen-toggle.mobile-chat.spec.ts`: `276` lines
- `apps/web/src/storage/backup.import.test.ts`: `424` lines

`SettingsDrawer.tsx`, `SettingsDataSection.tsx`, `WorkspaceShell.tsx`, `CanvasPanel.tsx`, `chat-store.ts`, `useRemoteBackupControls.ts`, `settings-remote-backup.ts`, `settings-store.ts`, `styles.css`, `backup.ts`, and `remote-sync.ts` are now within their current guardrails.
`settings-store.test.ts`, `backup.test.ts`, `browser-bridge.test.ts`, `admin-backups.test.ts`, `redis-backup-store.test.ts`, `settings-drawer.spec.ts`, and `fullscreen-toggle.spec.ts` are now within the thin-suite test guardrails.
`backup-import.ts`, `control-plane-client.ts`, `platform-runner.ts`, `runs.ts`, `admin-runs.ts`, `admin.ts`, `redis-backup-store.ts`, `backup-store.ts`, and `migrate.ts` are currently below the new `module` budget but remain close enough to track as recovery candidates.

## Current Actionable Build Warning

No actionable build warnings detected in the current web build as of 2026-04-04.

Resolved warning signature from the initial baseline:

```text
apps/web/src/storage/backup.ts is dynamically imported by apps/web/src/storage/remote-sync.ts but also statically imported by apps/web/src/components/SettingsDrawer.tsx, dynamic import will not move module into another chunk.
```

## Steady State Intent

The steady state keeps five views in sync:

1. repeatable hotspot reporting
2. budget documentation tied to production and include-tests thresholds
3. build warning detection
4. CI visibility for platform drift across web, gateway, and control-plane code
5. explicit guardrails for the new `/api/v3` entrypoints
