# Portable Agent Contract Cutover Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finalize the platform agent contract so GeoHelper uses portable agent bundles as the runtime source of truth.

**Architecture:** Shrink `PlatformAgentDefinition` down to portable-bundle semantics and remove deprecated per-agent execution declarations from the agent object. Run resolution will derive workflow, tool, and evaluator requirements from the selected run profile and workflow graph, while portable agent factories and tests are updated to the new contract. This intentionally drops the previous lightweight agent shape.

**Tech Stack:** TypeScript, Vitest, GeoHelper agent-protocol / agent-core / agent-sdk / agent-domain-geometry / control-plane / worker

---

## Task 1: Remove deprecated fields from the platform agent contract

**Files:**
- Modify: `packages/agent-protocol/src/platform-agent.ts`
- Modify: `packages/agent-sdk/src/bundle-registry.ts`
- Modify: `packages/agent-sdk/src/load-domain-bundle.ts`
- Modify: `packages/agent-domain-geometry/src/agents/geometry-solver.ts`
- Modify: `packages/agent-domain-geometry/src/agents/geometry-reviewer.ts`
- Test: `packages/agent-domain-geometry/test/geometry-domain.test.ts`

**Step 1: Write the failing test**

Change expectations so portable agents expose only bundle metadata and default budget.

**Step 2: Run the failing test**

Run: `pnpm --filter @geohelper/agent-domain-geometry test -- test/geometry-domain.test.ts`

Expected: FAIL because the current contract still publishes deprecated per-agent execution fields.

**Step 3: Implement the minimal protocol cut**

Change:
- `PlatformAgentDefinition` to only keep bundle-era agent metadata
- portable agent factory helper to stop accepting/setting deprecated fields
- bundle domain package loader to stop computing those fields

**Step 4: Re-run the test**

Run: `pnpm --filter @geohelper/agent-domain-geometry test -- test/geometry-domain.test.ts`

Expected: PASS

## Task 2: Make runtime resolution independent from deprecated agent fields

**Files:**
- Modify: `packages/agent-core/src/platform-runtime-context.ts`
- Test: `packages/agent-core/test/platform-runtime-context.test.ts`
- Test: `packages/agent-sdk/test/platform-registry.test.ts`

**Step 1: Write the failing tests**

Cover:
- run resolution still succeeds without agent-level tool/evaluator declarations
- missing tool/evaluator failures are now driven by workflow requirements alone

**Step 2: Run the failing tests**

Run:
- `pnpm --filter @geohelper/agent-core test -- test/platform-runtime-context.test.ts`
- `pnpm --filter @geohelper/agent-sdk test -- test/platform-registry.test.ts`

Expected: FAIL because runtime resolution still reads deprecated agent fields.

**Step 3: Implement minimal runtime cutover**

Update:
- `createPlatformRuntimeContext()` to derive required tools/evaluators from workflow nodes only
- test bootstrap fixtures so agent objects only use the new shape

**Step 4: Re-run the tests**

Run:
- `pnpm --filter @geohelper/agent-core test -- test/platform-runtime-context.test.ts`
- `pnpm --filter @geohelper/agent-sdk test -- test/platform-registry.test.ts`

Expected: PASS

## Task 3: Update downstream runtime, control-plane, and worker tests to the new contract

**Files:**
- Modify: `apps/control-plane/test/control-plane-context.test.ts`
- Modify: `apps/control-plane/test/platform-catalog-route.test.ts`
- Modify: `apps/control-plane/test/acp-sessions-route.test.ts`
- Modify: `apps/control-plane/test/checkpoints-route.test.ts`
- Modify: `apps/worker/test/run-loop.test.ts`
- Modify: `apps/worker/test/run-loop-subagent.test.ts`
- Modify: any additional tests or fixtures revealed by typecheck

**Step 1: Write the failing tests**

Update fixtures so agent definitions stop including deprecated per-agent execution fields, while preserving run-profile and workflow behavior.

**Step 2: Run the failing tests**

Run:
- `pnpm --filter @geohelper/control-plane test -- test/control-plane-context.test.ts test/platform-catalog-route.test.ts test/acp-sessions-route.test.ts test/checkpoints-route.test.ts`
- `pnpm --filter @geohelper/worker test -- test/run-loop.test.ts test/run-loop-subagent.test.ts`

Expected: FAIL because test fixtures still assume the old agent shape.

**Step 3: Implement minimal fixture and assertion updates**

Keep:
- run profiles exposing `workflowId`
- agents exposing bundle metadata and default budget only

**Step 4: Re-run the tests**

Run the same commands again.

Expected: PASS

## Task 4: Verification pass and plan index update

**Files:**
- Modify: `docs/plans/README.md`

**Step 1: Run focused verification**

Run:
- `pnpm --filter @geohelper/agent-domain-geometry test`
- `pnpm --filter @geohelper/agent-core test`
- `pnpm --filter @geohelper/agent-sdk test`
- `pnpm --filter @geohelper/control-plane test`
- `pnpm --filter @geohelper/worker test`

**Step 2: Run cross-repo verification**

Run:
- `pnpm typecheck`
- `pnpm exec eslint packages/agent-protocol packages/agent-core packages/agent-sdk packages/agent-domain-geometry apps/control-plane apps/worker`

**Step 3: Update plan index**

Add this plan to `docs/plans/README.md`.
