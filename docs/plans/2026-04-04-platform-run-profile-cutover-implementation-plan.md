# Platform Run Profile Cutover Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the remaining geometry-specific hardcoding from the active web runtime path by introducing platform run profiles that carry `agentId`, `workflowId`, and default run budgets.

**Architecture:** Add a small built-in run-profile registry in the web runtime, persist only the selected profile id in settings, resolve that profile into compile/runtime options, and pass it all the way through `chat-store -> platform-runner -> control-plane client`.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest

---

### Task 1: Add Red Tests For Platform Run Profile Selection

**Files:**
- Modify: `apps/web/src/state/settings-runtime-resolver.test.ts`
- Modify: `apps/web/src/state/chat-store.test.ts`
- Create: `apps/web/src/runtime/platform-runner.test.ts`

**Step 1: Write the failing settings resolver test**

Assert that compile runtime options expose the selected platform run profile and its default budget.

**Step 2: Write the failing chat-store forwarding test**

Assert that `chat-store.send()` forwards the resolved platform run profile into the runtime compile call.

**Step 3: Write the failing platform runner test**

Assert that `submitPromptToPlatform()` sends `agentId`, `workflowId`, and `budget` from the selected platform run profile to the control plane.

**Step 4: Run targeted tests to verify failure**

Run:

```bash
pnpm test -- apps/web/src/state/settings-runtime-resolver.test.ts apps/web/src/state/chat-store.test.ts apps/web/src/runtime/platform-runner.test.ts
```

### Task 2: Introduce Built-In Platform Run Profiles

**Files:**
- Create: `apps/web/src/runtime/platform-run-profiles.ts`
- Modify: `apps/web/src/runtime/types.ts`

**Step 1: Add a small built-in registry**

Define a default profile and at least one alternate budgeted profile to make selection meaningful.

**Step 2: Extend runtime request typing**

Add a first-class `PlatformRunProfile` type to the active runtime path.

### Task 3: Thread The Selected Profile Through Settings And Chat

**Files:**
- Modify: `apps/web/src/state/settings-persistence.ts`
- Modify: `apps/web/src/state/settings-store.ts`
- Modify: `apps/web/src/state/settings-store-slices/runtime-and-presets.ts`
- Modify: `apps/web/src/state/settings-runtime-resolver.ts`
- Modify: `apps/web/src/state/chat-store.ts`
- Modify: `apps/web/src/state/chat-store-actions.ts`

**Step 1: Persist only the selected profile id**

Keep schema version stable and default missing snapshots to the built-in default profile.

**Step 2: Resolve compile options with the selected run profile**

Expose `platformRunProfile` from `resolveCompileRuntimeOptions()`.

**Step 3: Forward the profile into the runtime compile request**

Pass the resolved profile from `chat-store` into `submitPromptToPlatform()`.

### Task 4: Teach The Platform Runner To Start Runs From Profiles

**Files:**
- Modify: `apps/web/src/runtime/platform-runner.ts`
- Modify: `apps/web/src/runtime/control-plane-client.ts`

**Step 1: Remove local geometry constants**

Replace inline `DEFAULT_AGENT_ID` / `DEFAULT_WORKFLOW_ID` with the selected profile.

**Step 2: Send default budget when starting runs**

Include the selected profile budget in the control-plane `startRun` request.

### Task 5: Verify And Commit

**Files:**
- Verify only

**Step 1: Re-run the targeted tests**

Run:

```bash
pnpm test -- apps/web/src/state/settings-runtime-resolver.test.ts apps/web/src/state/chat-store.test.ts apps/web/src/runtime/platform-runner.test.ts
```

**Step 2: Re-run repo guardrails**

Run:

```bash
pnpm lint
pnpm test -- apps/web/src/state/settings-runtime-resolver.test.ts apps/web/src/state/chat-store.test.ts apps/web/src/runtime/platform-runner.test.ts
```
