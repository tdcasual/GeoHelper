# Control Plane Platform Catalog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose the default platform runtime catalog through the control-plane so web, admin tooling, and future scheduler consumers can read one canonical registry snapshot.

**Architecture:** Add a control-plane catalog helper that projects the in-process `platformRuntime` into a transport-safe metadata snapshot: `runProfiles`, `agents`, `workflows`, `tools`, and `evaluators`. Then wire both a new public `GET /api/v3/platform/catalog` route and an admin `GET /admin/platform/catalog` route to that shared helper, and make the existing `GET /api/v3/run-profiles` route reuse the same snapshot instead of reading a separate map directly.

**Tech Stack:** TypeScript, Fastify, Vitest

---

### Task 1: Write Red Tests For Platform Catalog Routes

**Files:**
- Create: `apps/control-plane/test/platform-catalog-route.test.ts`
- Modify: `apps/control-plane/test/runs-route.test.ts`

**Step 1: Write the failing public/admin catalog route tests**

Assert that:
- `GET /api/v3/platform/catalog` returns the default geometry `runProfiles`, `agents`, `workflows`, `tools`, and `evaluators`
- `GET /admin/platform/catalog` exposes the same canonical snapshot
- tool metadata is transport-safe, containing fields such as `name`, `kind`, `permissions`, and `retryable`

**Step 2: Write the failing run-profiles consistency test**

Assert that `GET /api/v3/run-profiles` returns the same run profile list as the platform catalog snapshot.

**Step 3: Run targeted tests to verify failure**

Run:

```bash
pnpm test -- apps/control-plane/test/platform-catalog-route.test.ts apps/control-plane/test/runs-route.test.ts
```

### Task 2: Implement Shared Catalog Snapshot And Routes

**Files:**
- Create: `apps/control-plane/src/platform-catalog.ts`
- Create: `apps/control-plane/src/routes/platform-catalog.ts`
- Modify: `apps/control-plane/src/routes/run-profiles.ts`
- Modify: `apps/control-plane/src/server.ts`

**Step 1: Build the catalog snapshot helper**

Project the runtime into a stable serializable shape, with deterministic ordering and transport-safe metadata.

**Step 2: Add public/admin catalog routes**

Serve the shared snapshot from both `/api/v3/platform/catalog` and `/admin/platform/catalog`.

**Step 3: Reuse the snapshot in run-profile listing**

Make `GET /api/v3/run-profiles` return `catalog.runProfiles` so the control-plane only has one canonical directory view.

### Task 3: Verify

**Files:**
- Verify only

**Step 1: Re-run targeted tests**

Run:

```bash
pnpm test -- apps/control-plane/test/platform-catalog-route.test.ts apps/control-plane/test/runs-route.test.ts
```

**Step 2: Re-run repo guardrails**

Run:

```bash
pnpm verify:architecture
pnpm test:e2e
```
