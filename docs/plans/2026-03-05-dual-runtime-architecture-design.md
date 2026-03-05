# Dual Runtime Architecture Design (Gateway + Direct BYOK)

Date: 2026-03-05
Status: Implemented in V1 baseline

## Goal

Support two runtime paths in the same static frontend:

1. `Gateway` runtime: official token auth + server-side orchestration.
2. `Direct BYOK` runtime: browser direct call with user-provided `base_url + key + model`.

`VITE_GATEWAY_URL` becomes optional; when absent, app should still run in Direct mode.

## Architecture

- Introduce runtime layer under `apps/web/src/runtime`:
  - `types.ts`: runtime target, capabilities, compile/login/revoke request contracts.
  - `orchestrator.ts`: target routing + unsupported-mode guard.
  - `gateway-client.ts`: gateway API adapter.
  - `direct-client.ts`: OpenAI-compatible direct adapter.
  - `compile-pipeline.ts`: JSON parse + `CommandBatch` schema validation.
- Keep `services/api-client.ts` as compatibility facade, now backed by runtime orchestrator.
- Extend settings snapshot to schema v3 with runtime profiles:
  - `runtimeProfiles`
  - `defaultRuntimeProfileId`
- Drive mode availability from runtime capabilities in UI.

## Data Flow

1. `settings-store` resolves compile runtime options:
   - target (`gateway` or `direct`)
   - runtime base URL
   - capability flags
   - mode-dependent credentials (`sessionToken` or `byokKey`)
2. `chat-store` sends compile request with runtime fields.
3. Orchestrator dispatches to corresponding client.
4. Shared compile pipeline validates `CommandBatch` before execution.

## Capability Model

- `gateway` capabilities:
  - `supportsOfficialAuth: true`
  - `supportsAgentSteps: true`
  - `supportsServerMetrics: true`
  - `supportsRateLimitHeaders: true`
- `direct` capabilities:
  - all above `false`

UI contract:

- Official mode selectable only when current runtime supports official auth.
- If runtime flips to unsupported, mode falls back to BYOK.

## Error Handling

Added runtime-level error normalization:

- `RUNTIME_NOT_CONFIGURED`
- `RUNTIME_MODE_UNSUPPORTED`
- `RUNTIME_TARGET_UNAVAILABLE`
- `CORS_BLOCKED`
- `DIRECT_UPSTREAM_ERROR`
- `INVALID_COMMAND_BATCH`

## Reflection 1 (Decoupling)

Initial idea was to patch `compileChat` with a direct branch.

Problem:

- `mode` would still mix auth semantics and transport semantics.
- New targets/providers would increase branching in business store code.

Revision:

- Introduce explicit runtime target and orchestrator boundary.
- Keep mode as user-level auth/experience concept, not transport router.

Result:

- Transport-specific behavior is isolated to runtime clients.
- Chat/store logic stays focused on retries, history, and rendering.

## Reflection 2 (Consistency)

Initial idea let each client parse and validate independently.

Problem:

- Validation behavior can diverge between gateway/direct paths.
- Regression debugging becomes path-dependent and harder to reproduce.

Revision:

- Add shared compile pipeline utility for JSON parsing + schema validation.

Result:

- Uniform `CommandBatch` quality gate in both runtime paths.
- Lower drift risk when adding new providers or targets.

## Migration & Compatibility

- Settings snapshot migrated to schema v3 in `storage/migrate.ts`.
- Backup merge logic updated to merge runtime profile sets.
- Existing `api-client` exports retained for compatibility with current callers/tests.

## Verification

- Runtime tests added:
  - orchestrator routing and unsupported mode checks
  - gateway client contract tests
  - direct client contract tests (including CORS mapping)
- Store tests updated:
  - runtime profile defaults
  - official-mode block on unsupported runtime
- Full monorepo test suite passes after implementation.
