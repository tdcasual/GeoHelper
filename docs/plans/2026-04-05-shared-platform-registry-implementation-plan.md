# Shared Platform Registry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the geometry domain package the single source of truth for the default platform registry so control-plane and worker boot from shared run-profile and workflow definitions.

**Architecture:** Extend `@geohelper/agent-domain-geometry` to publish a default platform registry containing `runProfiles` and `workflows`, with run-profile budgets derived from the geometry agent definition instead of duplicated literals. Then wire control-plane defaults and worker integration tests to consume that shared registry, removing the local control-plane catalog duplication.

**Tech Stack:** TypeScript, Vitest, Fastify

---

### Task 1: Add Red Tests For The Shared Registry

**Files:**
- Modify: `packages/agent-domain-geometry/test/geometry-domain.test.ts`
- Create: `apps/control-plane/test/control-plane-context.test.ts`
- Modify: `apps/worker/test/run-loop.test.ts`

**Step 1: Write the failing geometry domain test**

Assert that the geometry domain package exposes:
- `runProfiles.platform_geometry_standard`
- `runProfiles.platform_geometry_quick_draft`
- a standard profile budget that matches the geometry agent's default budget
- profile workflow ids that point at registered workflows

**Step 2: Write the failing control-plane default catalog test**

Assert that `createControlPlaneServices()` exposes the same default run-profile ids as the geometry domain registry.

**Step 3: Write the failing worker integration test**

Assert that `createRunLoop()` can execute a run using `createGeometryDomainPackage().runProfiles` and `.workflows` instead of hand-built test catalogs.

**Step 4: Run targeted tests to verify failure**

Run:

```bash
pnpm test -- packages/agent-domain-geometry/test/geometry-domain.test.ts apps/control-plane/test/control-plane-context.test.ts apps/worker/test/run-loop.test.ts
```

### Task 2: Implement The Shared Geometry Platform Registry

**Files:**
- Create: `packages/agent-domain-geometry/src/run-profiles.ts`
- Modify: `packages/agent-domain-geometry/src/index.ts`
- Modify: `apps/control-plane/src/control-plane-context.ts`
- Delete: `apps/control-plane/src/platform-run-profiles.ts`
- Modify: `apps/control-plane/package.json`
- Modify: `apps/worker/package.json`

**Step 1: Add geometry run-profile factories**

Create helpers that build the standard and quick-draft platform run profiles from the geometry agent definition.

**Step 2: Publish runProfiles from the geometry domain package**

Extend `createGeometryDomainPackage()` so the default registry includes `runProfiles` alongside `agents`, `workflows`, `tools`, and `evaluators`.

**Step 3: Point control-plane defaults at the shared registry**

Replace the local run-profile catalog with the geometry domain package registry and keep the external `Map<string, PlatformRunProfile>` shape unchanged for routes.

### Task 3: Verify And Commit

**Files:**
- Verify only

**Step 1: Re-run targeted tests**

Run:

```bash
pnpm test -- packages/agent-domain-geometry/test/geometry-domain.test.ts apps/control-plane/test/control-plane-context.test.ts apps/worker/test/run-loop.test.ts
```

**Step 2: Re-run repo guardrails**

Run:

```bash
pnpm verify:architecture
pnpm test:e2e
```
