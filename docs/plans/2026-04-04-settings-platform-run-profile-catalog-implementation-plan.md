# Settings Platform Run Profile Catalog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose control-plane platform run profiles inside the web settings drawer so users can discover, refresh, and choose platform run profiles instead of relying on hidden local defaults.

**Architecture:** Add a non-persisted platform run profile catalog state to the web settings store, seeded by the built-in local catalog and refreshable from the active gateway runtime via the control-plane client. Then extend the general settings section with a platform run profile selector, source/status messaging, and a refresh action while preserving local fallback behavior when the catalog cannot be fetched.

**Tech Stack:** TypeScript, Zustand, Vitest, Playwright

---

### Task 1: Add Failing Tests

**Files:**
- Modify: `apps/web/src/state/settings-store.runtime.test.ts`
- Modify: `tests/e2e/settings-drawer.spec.ts`

**Step 1: Write the store refresh test**

Seed a gateway runtime, call the new refresh action with a mocked fetch response, and assert:
- the catalog source becomes `control_plane`
- the fetched profiles are stored
- a missing selected profile id is healed to the first fetched profile id

**Step 2: Write the fallback refresh test**

Mock a failed refresh and assert the catalog remains on the local built-in profiles with an explicit error state.

**Step 3: Write the settings drawer E2E**

Stub `GET /api/v3/run-profiles`, open settings, and assert:
- the platform run profile selector is visible in the general section
- remote labels appear
- clicking refresh keeps the selector on control-plane data

**Step 4: Run targeted tests to verify failure**

Run:

```bash
pnpm test -- apps/web/src/state/settings-store.runtime.test.ts
pnpm test:e2e --grep "settings drawer platform run profiles"
```

### Task 2: Implement Catalog Store and Settings UI

**Files:**
- Modify: `apps/web/src/state/settings-store.ts`
- Modify: `apps/web/src/runtime/control-plane-client.ts`
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `apps/web/src/components/settings-drawer/SettingsGeneralSection.tsx`
- Create: `apps/web/src/state/platform-run-profile-catalog.ts`

**Step 1: Add catalog state and refresh action**

Create a small helper module that resolves:
- local built-in catalog snapshot
- remote fetch via control-plane
- source/status/error presentation

Expose non-persisted state on the settings store:
- `platformRunProfileCatalog`
- `refreshPlatformRunProfiles()`

**Step 2: Refresh from the active gateway runtime**

When the default runtime is a gateway with `baseUrl`, fetch `/api/v3/run-profiles`.
On success:
- store the remote profiles
- mark source as `control_plane`
- heal the selected id to the first remote profile when the current selection is missing

On failure:
- keep local built-in profiles
- record the fetch failure message

**Step 3: Render the selector in settings**

Add to the general settings section:
- current platform run profile selector
- source/status hint
- refresh button
- concise fallback/error hint

### Task 3: Verify

**Files:**
- Verify only

**Step 1: Re-run targeted tests**

Run:

```bash
pnpm test -- apps/web/src/state/settings-store.runtime.test.ts
pnpm test:e2e --grep "settings drawer platform run profiles"
```

**Step 2: Re-run repo guardrails**

Run:

```bash
pnpm verify:architecture
pnpm test:e2e
```
