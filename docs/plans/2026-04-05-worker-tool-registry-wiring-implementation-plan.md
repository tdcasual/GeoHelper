# Worker Tool Registry Wiring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the worker consume registered tool definitions during execution instead of relying on duplicated `toolKind` metadata inside workflow node configs.

**Architecture:** Add a red test proving browser-tool checkpoints can be inferred from the platform runtime's tool registry even when the workflow node only carries `toolName`. Then update the worker run loop's default tool handler to resolve the active run through `platformRuntime`, look up the tool definition by name, and branch on the registered tool kind. This keeps workflow graphs declarative while shifting execution semantics to the shared platform registry.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Add Red Tests For Registry-Driven Tool Kind Resolution

**Files:**
- Modify: `apps/worker/test/run-loop.test.ts`

**Step 1: Write the failing browser-tool test**

Assert that a workflow node with only `toolName: "scene.read_state"` still pauses for a checkpoint when the resolved platform runtime tool definition says `kind: "browser_tool"`.

**Step 2: Run targeted test to verify failure**

Run:

```bash
pnpm test -- apps/worker/test/run-loop.test.ts
```

### Task 2: Wire Worker Tool Handling To The Registry

**Files:**
- Modify: `apps/worker/package.json`
- Modify: `apps/worker/src/run-loop.ts`

**Step 1: Resolve tool definitions from the platform runtime**

Use the shared runtime context to resolve the run, then inspect the selected tool definition when the default tool handler runs.

**Step 2: Remove workflow-config dependence for tool kind**

Infer browser-tool checkpoint behavior from the registered tool definition's `kind` field instead of `node.config.toolKind`.

### Task 3: Verify

**Files:**
- Verify only

**Step 1: Re-run targeted tests**

Run:

```bash
pnpm test -- apps/worker/test/run-loop.test.ts apps/worker/test/worker.test.ts
```
