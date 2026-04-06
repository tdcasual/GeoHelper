# SQLite Agent Store Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a durable SQLite-backed `agent-store` adapter so platform runs, events, checkpoints, artifacts, and memory entries can survive process restarts without requiring Postgres/Redis infrastructure.

**Architecture:** Keep the existing `AgentStore` interface unchanged and introduce a new `createSqliteAgentStore()` adapter beside the current memory implementation. The adapter will use Node's built-in `node:sqlite` `DatabaseSync` API, persist the existing run ledger entities in a SQLite schema that matches current protocol shapes, and expose the same repo semantics. Control-plane bootstrapping will gain an opt-in environment hook so local platform runs can use the durable store without changing test defaults.

**Tech Stack:** TypeScript, Node `node:sqlite`, Vitest, Fastify

---

### Task 1: Add Red Tests For Durable Agent Store

**Files:**
- Modify: `packages/agent-store/test/run-store.test.ts`
- Modify: `apps/control-plane/test/control-plane-context.test.ts`

**Step 1: Write the failing SQLite snapshot persistence test**

Create a temp SQLite file, write a run plus event/checkpoint/artifact/memory via `createSqliteAgentStore()`, reopen the store from the same path, and assert `loadRunSnapshot()` reconstructs the original ledger.

**Step 2: Write the failing SQLite filter test**

Assert that `listRuns({ status })` and `listCheckpointsByStatus()` still return sorted, correct rows after reopening the database.

**Step 3: Write the failing control-plane env store test**

Assert that a control-plane helper using `GEOHELPER_AGENT_STORE_SQLITE_PATH` boots with the SQLite adapter while the default path still uses the memory store.

**Step 4: Run targeted tests to verify failure**

Run:

```bash
pnpm test -- packages/agent-store/test/run-store.test.ts apps/control-plane/test/control-plane-context.test.ts
```

### Task 2: Implement The SQLite Agent Store Adapter

**Files:**
- Create: `packages/agent-store/src/sqlite-store.ts`
- Modify: `packages/agent-store/src/index.ts`
- Modify: `packages/agent-store/src/schema.sql`
- Modify: `packages/agent-store/package.json`
- Modify: `apps/control-plane/src/control-plane-context.ts`

**Step 1: Add a SQLite-compatible schema**

Adjust the schema to use SQLite-friendly column types while preserving current entity fields and sort semantics.

**Step 2: Implement `createSqliteAgentStore()`**

Add a durable adapter that:
- opens a SQLite file
- applies schema bootstrap on startup
- persists runs/events/checkpoints/artifacts/memory entries
- reconstructs `RunSnapshot`
- preserves existing repo ordering/filter behavior

**Step 3: Add an opt-in control-plane store bootstrap**

Expose a small helper that returns the SQLite adapter when `GEOHELPER_AGENT_STORE_SQLITE_PATH` is set, otherwise keeps `createMemoryAgentStore()`.

### Task 3: Verify And Commit

**Files:**
- Verify only

**Step 1: Re-run targeted tests**

Run:

```bash
pnpm test -- packages/agent-store/test/run-store.test.ts apps/control-plane/test/control-plane-context.test.ts
```

**Step 2: Re-run repo guardrails**

Run:

```bash
pnpm verify:architecture
pnpm test:e2e
```
