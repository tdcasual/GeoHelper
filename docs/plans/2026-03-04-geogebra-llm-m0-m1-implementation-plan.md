# GeoHelper M0-M1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a production-ready M0/M1 baseline: static-deployable web app on EdgeOne with GeoGebra rendering, NextChat-style chat UX, and a single-agent LiteLLM gateway that returns validated `CommandBatch` JSON.

**Architecture:** Use a TypeScript monorepo with a static React frontend (`apps/web`) and an independent Node gateway (`apps/gateway`). The frontend renders GeoGebra and executes only whitelisted structured commands. The gateway handles official token login, short-lived session issuance, LiteLLM request forwarding, and schema-validated command responses.

**Tech Stack:** `pnpm` workspaces, React + Vite + TypeScript, Zustand, Dexie, Fastify, Zod, Vitest, Playwright, tsup.

---

## Implementation Rules

- Follow DRY + YAGNI.
- Apply TDD in each task: failing test -> minimal implementation -> passing test.
- Keep commits small and frequent.
- Skills to apply during execution: `@test-driven-development`, `@systematic-debugging`, `@verification-before-completion`, `@requesting-code-review`.

## Repository Target Layout

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `apps/web/*`
- `apps/gateway/*`
- `packages/protocol/*`
- `tests/e2e/*`
- `docs/api/m0-m1-contract.md`

## Task 1: Bootstrap Monorepo and Tooling

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `.gitignore`
- Create: `tests/workspace/structure.test.ts`

**Step 1: Write the failing test**

```ts
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("workspace structure", () => {
  it("contains required app and package folders", () => {
    expect(existsSync("apps/web")).toBe(true);
    expect(existsSync("apps/gateway")).toBe(true);
    expect(existsSync("packages/protocol")).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest tests/workspace/structure.test.ts`
Expected: FAIL because folders do not exist yet.

**Step 3: Write minimal implementation**

- Add workspace root configs and scripts.
- Create empty directories for `apps/web`, `apps/gateway`, `packages/protocol`.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest tests/workspace/structure.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.workspace.ts .gitignore tests/workspace/structure.test.ts apps/web apps/gateway packages/protocol
git commit -m "chore: initialize monorepo skeleton"
```

## Task 2: Build Shared Protocol Package (`CommandBatch`)

**Files:**
- Create: `packages/protocol/package.json`
- Create: `packages/protocol/src/index.ts`
- Create: `packages/protocol/src/schema.ts`
- Create: `packages/protocol/tsconfig.json`
- Create: `packages/protocol/test/schema.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { CommandBatchSchema } from "../src/schema";

describe("CommandBatchSchema", () => {
  it("rejects unknown operation", () => {
    const result = CommandBatchSchema.safeParse({
      version: "1.0",
      scene_id: "s1",
      transaction_id: "t1",
      commands: [{ id: "c1", op: "eval_js", args: {}, depends_on: [], idempotency_key: "k1" }],
      post_checks: [],
      explanations: [],
    });
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/protocol test`
Expected: FAIL (`CommandBatchSchema` not defined).

**Step 3: Write minimal implementation**

- Implement Zod schemas for batch and command.
- Restrict `op` to whitelist (`create_point`, `create_line`, `create_conic`, `set_property`, `create_slider`, `create_3d_object`, `run_cas`, `run_probability_tool`).

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/protocol test`
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/protocol
git commit -m "feat(protocol): add command batch schema and validators"
```

## Task 3: Gateway Skeleton + Health Endpoint

**Files:**
- Create: `apps/gateway/package.json`
- Create: `apps/gateway/src/server.ts`
- Create: `apps/gateway/src/routes/health.ts`
- Create: `apps/gateway/src/config.ts`
- Create: `apps/gateway/test/health.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

describe("GET /api/v1/health", () => {
  it("returns ok", async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).status).toBe("ok");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/gateway test`
Expected: FAIL (server not implemented).

**Step 3: Write minimal implementation**

- Add Fastify server factory and `/api/v1/health` route.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/gateway test`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/gateway
git commit -m "feat(gateway): scaffold fastify server and health route"
```

## Task 4: Official Token Login + Session Issuance

**Files:**
- Create: `apps/gateway/src/routes/auth.ts`
- Create: `apps/gateway/src/services/token-auth.ts`
- Create: `apps/gateway/src/services/session.ts`
- Create: `apps/gateway/test/auth.test.ts`
- Modify: `apps/gateway/src/server.ts`
- Modify: `apps/gateway/src/config.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

describe("POST /api/v1/auth/token/login", () => {
  it("returns session token for valid preset token", async () => {
    const app = buildServer({ PRESET_TOKEN: "geo-allow" });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/token/login",
      payload: { token: "geo-allow", device_id: "d1" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).session_token).toBeTypeOf("string");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/gateway test auth.test.ts`
Expected: FAIL (`/auth/token/login` missing).

**Step 3: Write minimal implementation**

- Validate preset token from env.
- Issue short-lived signed session token (e.g. 30 minutes).

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/gateway test auth.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/gateway/src/routes/auth.ts apps/gateway/src/services/token-auth.ts apps/gateway/src/services/session.ts apps/gateway/src/server.ts apps/gateway/src/config.ts apps/gateway/test/auth.test.ts
git commit -m "feat(gateway): add preset token login and session issuance"
```

## Task 5: Single-Agent Compile Endpoint (LiteLLM)

**Files:**
- Create: `apps/gateway/src/routes/compile.ts`
- Create: `apps/gateway/src/services/litellm-client.ts`
- Create: `apps/gateway/src/services/compile-agent.ts`
- Create: `apps/gateway/src/services/verify-command-batch.ts`
- Create: `apps/gateway/test/compile.test.ts`
- Modify: `apps/gateway/src/server.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { buildServer } from "../src/server";

vi.mock("../src/services/litellm-client", () => ({
  requestCommandBatch: vi.fn().mockResolvedValue({
    version: "1.0",
    scene_id: "s1",
    transaction_id: "t1",
    commands: [],
    post_checks: [],
    explanations: [],
  }),
}));

describe("POST /api/v1/chat/compile", () => {
  it("returns validated command batch", async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      payload: { message: "画一个半径为3的圆", mode: "byok" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).batch.version).toBe("1.0");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/gateway test compile.test.ts`
Expected: FAIL (`/chat/compile` missing).

**Step 3: Write minimal implementation**

- Add compile route.
- Call LiteLLM-compatible endpoint.
- Validate returned JSON with `@geohelper/protocol` schema before response.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/gateway test compile.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/gateway/src/routes/compile.ts apps/gateway/src/services/litellm-client.ts apps/gateway/src/services/compile-agent.ts apps/gateway/src/services/verify-command-batch.ts apps/gateway/src/server.ts apps/gateway/test/compile.test.ts
git commit -m "feat(gateway): add single-agent compile endpoint with schema validation"
```

## Task 6: Web App Shell (Canvas + Chat + Fullscreen Toggle)

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/components/WorkspaceShell.tsx`
- Create: `apps/web/src/components/CanvasPanel.tsx`
- Create: `apps/web/src/components/ChatPanel.tsx`
- Create: `apps/web/src/styles.css`
- Create: `apps/web/src/state/ui-store.ts`
- Create: `apps/web/src/state/ui-store.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { createUIStore } from "./ui-store";

describe("ui-store", () => {
  it("toggles chat panel visibility", () => {
    const store = createUIStore();
    expect(store.getState().chatVisible).toBe(true);
    store.getState().toggleChat();
    expect(store.getState().chatVisible).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test ui-store.test.ts`
Expected: FAIL (store missing).

**Step 3: Write minimal implementation**

- Implement split layout and chat hide/show toggle.
- Ensure chat hidden state makes canvas full width.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test ui-store.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add workspace shell with full-screen canvas toggle"
```

## Task 7: GeoGebra Adapter + Whitelist Command Executor

**Files:**
- Create: `apps/web/src/geogebra/adapter.ts`
- Create: `apps/web/src/geogebra/command-executor.ts`
- Create: `apps/web/src/geogebra/op-handlers.ts`
- Create: `apps/web/src/geogebra/command-executor.test.ts`
- Modify: `apps/web/src/components/CanvasPanel.tsx`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { executeBatch } from "./command-executor";

describe("executeBatch", () => {
  it("rejects non-whitelisted operation", async () => {
    await expect(
      executeBatch({
        version: "1.0",
        scene_id: "s1",
        transaction_id: "t1",
        commands: [{ id: "1", op: "eval_js" as any, args: {}, depends_on: [], idempotency_key: "k" }],
        post_checks: [],
        explanations: [],
      })
    ).rejects.toThrow("Unsupported op");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test command-executor.test.ts`
Expected: FAIL (`executeBatch` missing).

**Step 3: Write minimal implementation**

- Implement command dispatcher using whitelist handlers.
- Wire adapter with GeoGebra applet instance.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test command-executor.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/geogebra apps/web/src/components/CanvasPanel.tsx
git commit -m "feat(web): execute validated geogebra command batches"
```

## Task 8: Chat Flow + BYOK/Official Mode Switch

**Files:**
- Create: `apps/web/src/state/chat-store.ts`
- Create: `apps/web/src/services/api-client.ts`
- Create: `apps/web/src/components/ModelModeSwitcher.tsx`
- Create: `apps/web/src/components/TokenGateDialog.tsx`
- Create: `apps/web/src/state/chat-store.test.ts`
- Modify: `apps/web/src/components/ChatPanel.tsx`
- Modify: `apps/web/src/App.tsx`

**Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { createChatStore } from "./chat-store";

it("stores compile result and appends assistant message", async () => {
  const compile = vi.fn().mockResolvedValue({ batch: { version: "1.0", scene_id: "s1", transaction_id: "t1", commands: [], post_checks: [], explanations: [] } });
  const store = createChatStore({ compile });
  await store.getState().send("画一个圆");
  expect(store.getState().messages.at(-1)?.role).toBe("assistant");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test chat-store.test.ts`
Expected: FAIL (`createChatStore` missing).

**Step 3: Write minimal implementation**

- Add mode switch (`byok` / `official`).
- Official mode: call login endpoint once token provided.
- Send compile request and forward returned `batch` to executor.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test chat-store.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/state/chat-store.ts apps/web/src/services/api-client.ts apps/web/src/components/ModelModeSwitcher.tsx apps/web/src/components/TokenGateDialog.tsx apps/web/src/components/ChatPanel.tsx apps/web/src/App.tsx apps/web/src/state/chat-store.test.ts
git commit -m "feat(web): add chat pipeline with byok and official modes"
```

## Task 9: Local Persistence + Import/Export (V1 Local-First)

**Files:**
- Create: `apps/web/src/storage/db.ts`
- Create: `apps/web/src/storage/backup.ts`
- Create: `apps/web/src/storage/migrate.ts`
- Create: `apps/web/src/storage/backup.test.ts`
- Modify: `apps/web/src/state/chat-store.ts`
- Modify: `apps/web/src/state/ui-store.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { exportBackup, importBackup } from "./backup";

describe("backup", () => {
  it("round-trips conversations and settings", async () => {
    const blob = await exportBackup({ conversations: [{ id: "c1" }], settings: { chatVisible: false } } as any);
    const restored = await importBackup(blob);
    expect(restored.conversations[0].id).toBe("c1");
    expect(restored.settings.chatVisible).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test backup.test.ts`
Expected: FAIL (backup module missing).

**Step 3: Write minimal implementation**

- Add Dexie database for conversations and batches.
- Implement `geochat-backup.json` export/import with checksum.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test backup.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/storage apps/web/src/state/chat-store.ts apps/web/src/state/ui-store.ts
git commit -m "feat(web): add local-first persistence and backup import export"
```

## Task 10: API Contract Draft (M0/M1)

**Files:**
- Create: `docs/api/m0-m1-contract.md`
- Create: `apps/gateway/test/contract-smoke.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("api contract doc", () => {
  it("includes auth and compile endpoints", () => {
    const doc = fs.readFileSync("docs/api/m0-m1-contract.md", "utf8");
    expect(doc).toContain("POST /api/v1/auth/token/login");
    expect(doc).toContain("POST /api/v1/chat/compile");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/gateway test contract-smoke.test.ts`
Expected: FAIL (doc missing).

**Step 3: Write minimal implementation**

- Document request/response JSON for `health`, `auth`, `compile`.
- Include auth header requirements and error code table.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/gateway test contract-smoke.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add docs/api/m0-m1-contract.md apps/gateway/test/contract-smoke.test.ts
git commit -m "docs(api): add m0 m1 contract draft"
```

## Task 11: End-to-End Smoke Tests (M1 Gate)

**Files:**
- Create: `tests/e2e/chat-to-render.spec.ts`
- Create: `tests/e2e/fullscreen-toggle.spec.ts`
- Create: `playwright.config.ts`
- Modify: `package.json`

**Step 1: Write the failing test**

```ts
import { test, expect } from "@playwright/test";

test("chat panel can be hidden and canvas becomes full screen", async ({ page }) => {
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "Hide Chat" }).click();
  await expect(page.locator("[data-panel='chat']")).toBeHidden();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm playwright test tests/e2e/fullscreen-toggle.spec.ts`
Expected: FAIL (selectors or page behavior missing).

**Step 3: Write minimal implementation**

- Add stable `data-testid` / `data-panel` attributes.
- Ensure toggle behavior updates DOM and layout class.

**Step 4: Run test to verify it passes**

Run: `pnpm playwright test tests/e2e/fullscreen-toggle.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/e2e playwright.config.ts package.json apps/web/src
git commit -m "test(e2e): add m1 smoke tests for chat and canvas"
```

## Task 12: EdgeOne Deployment and Runbook

**Files:**
- Create: `apps/web/.env.example`
- Create: `docs/deploy/edgeone.md`
- Create: `.github/workflows/web-build.yml` (optional if CI is desired now)
- Modify: `README.md`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("deploy docs", () => {
  it("documents EdgeOne static deployment steps", () => {
    const txt = fs.readFileSync("docs/deploy/edgeone.md", "utf8");
    expect(txt).toContain("EdgeOne");
    expect(txt).toContain("pnpm --filter @geohelper/web build");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest tests/workspace/deploy-docs.test.ts`
Expected: FAIL until deploy doc exists.

**Step 3: Write minimal implementation**

- Document build/output path and required runtime envs.
- Add local run + gateway run commands in README.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest tests/workspace/deploy-docs.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/.env.example docs/deploy/edgeone.md README.md tests/workspace/deploy-docs.test.ts
git commit -m "docs: add edgeone deployment runbook for m0 m1"
```

## M0/M1 Acceptance Checklist

- [ ] `apps/web` builds to static assets successfully.
- [ ] Chat panel hide/show works; full-screen canvas verified by E2E.
- [ ] Gateway can validate preset token and issue short-lived session token.
- [ ] `/api/v1/chat/compile` returns schema-validated `CommandBatch`.
- [ ] Command executor rejects non-whitelisted operations.
- [ ] Local data persists across refresh and supports backup import/export.
- [ ] API contract doc and deploy runbook are complete.

## API Contract Draft (M0/M1)

### 1) `GET /api/v1/health`

Response `200`:

```json
{
  "status": "ok",
  "time": "2026-03-04T15:00:00Z"
}
```

### 2) `POST /api/v1/auth/token/login`

Request:

```json
{
  "token": "geo-allow",
  "device_id": "device-123"
}
```

Response `200`:

```json
{
  "session_token": "eyJ...",
  "expires_in": 1800,
  "token_type": "Bearer"
}
```

Error `401`:

```json
{
  "error": {
    "code": "INVALID_PRESET_TOKEN",
    "message": "Token is invalid"
  }
}
```

### 3) `POST /api/v1/chat/compile`

Headers:

- BYOK mode: `x-mode: byok`, `x-byok-endpoint`, `x-byok-key`, `x-model`
- Official mode: `Authorization: Bearer <session_token>`, `x-mode: official`, `x-model`

Request:

```json
{
  "conversation_id": "conv_001",
  "scene_id": "scene_001",
  "message": "画一个圆心在A，半径3的圆",
  "context": {
    "history": [
      { "role": "user", "content": "创建点A=(0,0)" }
    ],
    "scene_snapshot": { "objects": [] }
  }
}
```

Response `200`:

```json
{
  "trace_id": "tr_123",
  "batch": {
    "version": "1.0",
    "scene_id": "scene_001",
    "transaction_id": "tx_001",
    "commands": [
      {
        "id": "cmd_01",
        "op": "create_conic",
        "args": { "type": "circle", "center": "A", "radius": 3 },
        "depends_on": [],
        "idempotency_key": "ik_01"
      }
    ],
    "post_checks": [],
    "explanations": ["使用已存在点A创建圆"]
  },
  "agent_steps": [
    { "name": "intent", "status": "ok" },
    { "name": "planner", "status": "ok" },
    { "name": "command", "status": "ok" },
    { "name": "verifier", "status": "ok" }
  ]
}
```

Error `422`:

```json
{
  "error": {
    "code": "INVALID_COMMAND_BATCH",
    "message": "Command batch validation failed",
    "details": [{ "path": "commands[0].op", "reason": "unsupported op" }]
  }
}
```

### 4) Error Codes (M0/M1)

- `INVALID_PRESET_TOKEN`
- `SESSION_EXPIRED`
- `MISSING_AUTH_HEADER`
- `LITELLM_UPSTREAM_ERROR`
- `INVALID_COMMAND_BATCH`
- `RATE_LIMITED`

---

Plan complete and saved to `docs/plans/2026-03-04-geogebra-llm-m0-m1-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
