# Maintainability Baseline

Date: 2026-03-15
Status: Initial baseline before wave 1 maintainability work

## Budgets

- `maxComponentLines`: `500`
- `maxStoreLines`: `600`
- `maxStyleLines`: `700`

## Current Hotspots

Measured in the current baseline:

- `apps/web/src/components/SettingsDrawer.tsx`: `2442` lines
- `apps/web/src/components/WorkspaceShell.tsx`: `1426` lines
- `apps/web/src/state/settings-store.ts`: `1242` lines
- `apps/web/src/state/chat-store.ts`: `903` lines
- `apps/web/src/styles.css`: `2284` lines

These files are intentionally recorded as required hotspots for the first maintenance wave so that any future tooling and docs continue to track them explicitly.

## Current Actionable Build Warning

The current web build emits an actionable Vite warning related to backup code splitting:

```text
dynamic import will not move module into another chunk
```

This warning is currently triggered by backup logic being both dynamically imported in remote sync code and statically imported by settings UI.

Canonical normalized warning signature recorded for baseline matching:

```text
apps/web/src/storage/backup.ts is dynamically imported by apps/web/src/storage/remote-sync.ts but also statically imported by apps/web/src/components/SettingsDrawer.tsx, dynamic import will not move module into another chunk.
```

## Wave 1 Intent

Wave 1 does not try to eliminate every hotspot immediately. It establishes:

1. repeatable hotspot reporting
2. budget documentation
3. build warning detection
4. CI visibility for maintainability drift
