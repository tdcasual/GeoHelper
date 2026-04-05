# Web Platform Catalog Consumption Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the web runtime consume the new control-plane platform catalog route instead of the legacy run-profiles-only endpoint.

**Architecture:** Keep the web-facing `listRunProfiles()` API unchanged, but switch the control-plane client to fetch `/api/v3/platform/catalog` and return `catalog.runProfiles`. Update the runtime/store tests to mock the new response shape so the settings drawer truly consumes the canonical platform catalog route introduced in the control-plane.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Add Red Tests For Catalog Consumption

**Files:**
- Modify: `apps/web/src/runtime/control-plane-client.test.ts`
- Modify: `apps/web/src/state/settings-store.runtime.test.ts`

**Step 1: Write the failing client test**

Assert that `listRunProfiles()` fetches `/api/v3/platform/catalog` and reads `payload.catalog.runProfiles`.

**Step 2: Write the failing settings-store test**

Assert that refreshing the platform run profile catalog also hits `/api/v3/platform/catalog`.

**Step 3: Run targeted tests to verify failure**

Run:

```bash
pnpm test -- apps/web/src/runtime/control-plane-client.test.ts apps/web/src/state/settings-store.runtime.test.ts
```

### Task 2: Implement Catalog Consumption

**Files:**
- Modify: `apps/web/src/runtime/control-plane-client.ts`

**Step 1: Switch the control-plane client to the catalog route**

Fetch the canonical catalog payload and return its `runProfiles` list.

### Task 3: Verify

**Files:**
- Verify only

**Step 1: Re-run targeted tests**

Run:

```bash
pnpm test -- apps/web/src/runtime/control-plane-client.test.ts apps/web/src/state/settings-store.runtime.test.ts
```
