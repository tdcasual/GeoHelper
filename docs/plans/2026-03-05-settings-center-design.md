# GeoHelper Settings Center Design

- Date: 2026-03-05
- Status: validated + implemented

## Goal

Add a complete settings center in the web app so users can manage LLM behavior, BYOK/Official presets, per-conversation overrides, and experimental runtime switches from a top-right settings entry.

## UX Structure

- Entry: top-right `设置` button.
- Container: right-side drawer (`SettingsDrawer`) with grouped sections.
- Sections:
  - General: default mode (`byok`/`official`) and apply-to-current shortcut.
  - BYOK Presets: CRUD presets with model/endpoint/key/temperature/maxTokens/timeout.
  - Official Presets: separate preset list and defaults, independent from BYOK.
  - Session Overrides: per-conversation model/temperature/maxTokens/timeout/retry.
  - Experiment Flags: show agent steps, retry, timeout control, strict validation, single-agent fallback, debug panel, performance sampling.
  - Security: clear encrypted local secrets.
  - Debug Logs: local request/retry logs with clear action.

## Data & State

- New store: `apps/web/src/state/settings-store.ts`.
- Persistence key: `geohelper.settings.snapshot`.
- Snapshot includes:
  - default mode
  - BYOK/Official preset lists and default IDs
  - session override map by `conversationId`
  - experiment flags
  - default retry count
  - debug events

## Secret Handling

- Secret service: `apps/web/src/services/secure-secret.ts`.
- Strategy: system-managed local key (no user password prompt).
- Crypto: WebCrypto `AES-GCM` with random IV.
- Key lifecycle:
  - key generated on first use
  - key persisted in IndexedDB object store (`CryptoKey` structured clone)
  - BYOK API keys saved as encrypted ciphertext only
- Security action clears local key + all BYOK encrypted blobs.

## Runtime Resolution

- Resolver: `resolveCompileRuntimeOptions(...)`.
- Merge priority:
  - session override
  - mode default preset
  - preset intrinsic defaults
- Runtime outputs:
  - model
  - BYOK endpoint/key (BYOK mode)
  - timeout
  - retry attempts
  - experimental headers for strict/fallback/perf

## Chat Pipeline Integration

- `chat-store` now:
  - resolves runtime options before compile
  - injects model/byok endpoint/byok key/timeout/headers
  - retries request when enabled
  - writes debug logs when debug panel is enabled

## Validation

- Added/updated tests:
  - `apps/web/src/state/settings-store.test.ts`
  - `apps/web/src/state/chat-store.test.ts`
  - `tests/e2e/settings-drawer.spec.ts`
- Full regression completed (`pnpm test`, `pnpm test:e2e`, web build).
