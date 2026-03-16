# Dependency Rules

## Intent

These rules establish a first-pass dependency boundary before the larger maintainability refactor lands.

## Current Rules

1. `apps/web/src must not import apps/gateway/src`
2. `apps/gateway/src must not import apps/web/src`
3. `production app code must not import tests/`
4. `production app code must not import scripts/`

## Web Internal Rules

1. `components/` 不直接导入 `storage/backup.ts`
2. shell components 通过 controller hooks 间接访问 runtime side effects
3. `state/*-store.ts` 优先依赖 `*-persistence.ts` 和 `*-resolver.ts`

## Shared Contract

The shared contract layer lives in `packages/protocol`.

- app code may depend on the shared contract
- the shared contract should stay transport-safe and framework-light
- `packages/protocol must not import apps/`

## Future Direction

As `features/`, `shared/`, and gateway `modules/` land, these rules will be tightened so that:

1. shared UI/helpers cannot depend on feature code
2. route handlers only depend on module services and shared infra
3. new cross-app payloads are added through the shared contract first
