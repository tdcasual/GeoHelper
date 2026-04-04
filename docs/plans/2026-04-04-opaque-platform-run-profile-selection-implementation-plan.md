# Opaque Platform Run Profile Selection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let web settings persist and reload platform run profile selections as opaque ids so control-plane-defined profiles are not rewritten to the local built-in catalog.

**Architecture:** Add end-to-end store tests that prove an unknown platform run profile id survives `setDefaultPlatformAgentProfile()` and a store reload, while blank ids remain rejected. Then remove the local catalog coercion from the settings slice and snapshot normalization, keeping only the existing built-in default when no valid id exists at all.

**Tech Stack:** TypeScript, Zustand, Vitest, localStorage-backed settings persistence

---

### Task 1: Add Failing Tests

**Files:**
- Modify: `apps/web/src/state/settings-store.test.ts`

**Step 1: Write the opaque-id persistence test**

Use a memory `localStorage`, call `setDefaultPlatformAgentProfile("platform_remote_custom")`, recreate the store, and assert the reloaded snapshot keeps `"platform_remote_custom"`.

**Step 2: Write the blank-id guard test**

Attempt to set the selection to whitespace only and assert the current selection remains unchanged.

**Step 3: Run targeted tests to verify failure**

Run:

```bash
pnpm test -- apps/web/src/state/settings-store.test.ts
```

### Task 2: Remove Local Catalog Coercion

**Files:**
- Modify: `apps/web/src/state/settings-store-slices/runtime-and-presets.ts`
- Modify: `apps/web/src/state/settings-persistence.ts`

**Step 1: Keep opaque ids in the state action**

Change `setDefaultPlatformAgentProfile()` to accept any non-empty trimmed string and persist it directly.

**Step 2: Keep opaque ids during snapshot normalization**

Change settings snapshot loading to preserve any non-empty string `defaultPlatformAgentProfileId`, using the built-in default only when the field is missing or blank.

**Step 3: Preserve existing fallback behavior**

Do not change runtime resolution behavior: local profiles still remain the fallback source when remote lookup cannot produce a usable profile.

### Task 3: Verify

**Files:**
- Verify only

**Step 1: Re-run the targeted store test**

Run:

```bash
pnpm test -- apps/web/src/state/settings-store.test.ts
```

**Step 2: Re-run repo guardrails**

Run:

```bash
pnpm verify:architecture
pnpm test:e2e
```
