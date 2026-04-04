# Web Run Profile Catalog Resolution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the active web runtime resolve platform run profiles from the control-plane catalog first, while keeping local profile data only as a fallback when the catalog cannot be reached.

**Architecture:** Extend the web control-plane client with `GET /api/v3/run-profiles`, teach `settings-runtime-resolver` to fetch and select the remote profile for gateway runtimes, and fall back to the local built-in profile list when the remote catalog is unavailable.

**Tech Stack:** TypeScript, Vitest, Fetch API

---

### Task 1: Add Failing Tests

**Files:**
- Create: `apps/web/src/runtime/control-plane-client.test.ts`
- Modify: `apps/web/src/state/settings-runtime-resolver.test.ts`

**Step 1: Write the failing client test**

Assert that `createControlPlaneClient().listRunProfiles()` fetches `/api/v3/run-profiles` and returns the parsed profile list.

**Step 2: Write the failing resolver tests**

Cover:
- gateway runtimes prefer the remote catalog profile over the local fallback
- gateway runtimes fall back to the local profile when the remote catalog lookup fails

**Step 3: Run targeted tests to verify failure**

Run:

```bash
pnpm test -- apps/web/src/runtime/control-plane-client.test.ts apps/web/src/state/settings-runtime-resolver.test.ts
```

### Task 2: Implement Remote Catalog Resolution

**Files:**
- Modify: `apps/web/src/runtime/control-plane-client.ts`
- Modify: `apps/web/src/state/settings-runtime-resolver.ts`

**Step 1: Add `listRunProfiles()` to the control-plane client**

Fetch the control-plane catalog and return the parsed `runProfiles` array.

**Step 2: Resolve remote profiles in the settings resolver**

For gateway runtimes with a base URL, try the remote catalog first and choose the selected profile when present.

**Step 3: Keep local fallback behavior**

If the catalog request fails or returns no usable match, keep the existing local profile resolution.

### Task 3: Verify

**Files:**
- Verify only

**Step 1: Re-run targeted tests**

Run:

```bash
pnpm test -- apps/web/src/runtime/control-plane-client.test.ts apps/web/src/state/settings-runtime-resolver.test.ts
```

**Step 2: Re-run repo guardrails**

Run:

```bash
pnpm verify:architecture
pnpm test:e2e
```
