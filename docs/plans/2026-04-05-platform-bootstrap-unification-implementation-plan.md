# Platform Bootstrap Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Promote the geometry domain package from a shared registry source into an explicit default platform bootstrap that control-plane and worker both expose and consume.

**Architecture:** Add a `createGeometryPlatformBootstrap()` factory that returns the full domain bootstrap surface in one object: `agents`, `runProfiles`, `runProfileMap`, `workflows`, `tools`, and `evaluators`. Then wire control-plane services and the geometry worker runtime to carry that bootstrap object directly, so future scheduler/bootstrap consumers can use one canonical startup context instead of reconstructing partial registries.

**Tech Stack:** TypeScript, Vitest, Fastify

---

### Task 1: Add Red Tests For Explicit Platform Bootstrap

**Files:**
- Modify: `packages/agent-domain-geometry/test/geometry-domain.test.ts`
- Modify: `apps/control-plane/test/control-plane-context.test.ts`
- Modify: `apps/worker/test/worker.test.ts`

**Step 1: Write the failing domain bootstrap test**

Assert that `createGeometryPlatformBootstrap()` exposes:
- the same geometry agent id
- the same standard and quick-draft run profiles
- a `runProfileMap` keyed by profile id
- tool and evaluator registries needed by a future scheduler/bootstrap consumer

**Step 2: Write the failing control-plane services test**

Assert that `createControlPlaneServices()` exposes `platformBootstrap` and that `services.runProfiles` is derived from `services.platformBootstrap.runProfileMap`.

**Step 3: Write the failing worker runtime test**

Assert that `createGeometryWorkerRuntime()` returns `platformBootstrap` and that the run loop still executes using that bootstrap.

**Step 4: Run targeted tests to verify failure**

Run:

```bash
pnpm test -- packages/agent-domain-geometry/test/geometry-domain.test.ts apps/control-plane/test/control-plane-context.test.ts apps/worker/test/worker.test.ts
```

### Task 2: Implement The Bootstrap Surface

**Files:**
- Create: `packages/agent-domain-geometry/src/platform-bootstrap.ts`
- Modify: `packages/agent-domain-geometry/src/index.ts`
- Modify: `apps/control-plane/src/control-plane-context.ts`
- Modify: `apps/worker/src/worker.ts`

**Step 1: Add the explicit bootstrap factory**

Build a single geometry bootstrap object that includes both record and map views of the run profiles.

**Step 2: Preserve current callers**

Keep `createGeometryDomainPackage()` available, but make it delegate to the new bootstrap factory so older internal callers keep working.

**Step 3: Expose bootstrap from default app runtimes**

Add `platformBootstrap` to control-plane services and geometry worker runtime results, while preserving existing `runProfiles` and `runLoop` access patterns.

### Task 3: Verify And Commit

**Files:**
- Verify only

**Step 1: Re-run targeted tests**

Run:

```bash
pnpm test -- packages/agent-domain-geometry/test/geometry-domain.test.ts apps/control-plane/test/control-plane-context.test.ts apps/worker/test/worker.test.ts
```

**Step 2: Re-run repo guardrails**

Run:

```bash
pnpm verify:architecture
pnpm test:e2e
```
