# Backend V6 Gateway Vision & Attachments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable image attachments through the Gateway runtime so GeoHelper can support multimodal compile requests in self-hosted deployments without regressing the existing direct-runtime attachment flow.

**Architecture:** Reuse the existing web attachment UI and runtime request shape, then replace the Gateway's current hard reject path with a validated, capability-gated pass-through pipeline. Keep the scope narrow: image attachments only, single-request in-memory transport only, no background media service, no file catalog, and no generalized cloud storage. The Gateway remains stateless with operator-visible limits and tracing, while the web keeps local-first persistence and explicit capability checks.

**Tech Stack:** React + Zustand, Vitest, Playwright, Fastify, Zod, `@geohelper/protocol`, existing runtime orchestrator/gateway client/direct client, existing benchmark + smoke script patterns.

---

## Scope Guardrails

- **In scope:** image attachments for compile requests, Gateway capability gating, request validation, operator observability, focused smoke/benchmark coverage, docs updates.
- **Out of scope:** PDF/doc ingestion, object storage for end-user uploads, attachment history sync, OCR pipeline, vision-specific prompt orchestration service, multi-tenant media catalogs.
- **Contract choice:** direct runtime and gateway runtime should share the same attachment payload shape; Gateway should stop returning `ATTACHMENTS_UNSUPPORTED` only when the configured upstream path explicitly supports vision.

## Current Baseline (Must Preserve)

- Web already supports image attachment collection and preview in direct mode via plus-menu / drag-drop / paste E2E coverage.
- `apps/web/src/runtime/gateway-client.ts` already forwards `attachments` in compile payloads.
- `apps/gateway/src/routes/compile.ts` currently rejects non-empty attachments with `ATTACHMENTS_UNSUPPORTED`.
- `docs/BETA_CHECKLIST.md` still documents attachment rejection as a current known limit.

## Phase Map

- `P0`: Shared attachment contract hardening.
- `P1`: Gateway runtime capability + validation path.
- `P2`: Web runtime capability surfacing for gateway vision.
- `P3`: Operator verification and benchmark coverage.
- `P4`: Release-gate and deployment docs refresh.

---

### Task 1: Normalize the shared image attachment contract in `@geohelper/protocol`

**Files:**
- Create: `packages/protocol/src/attachments.ts`
- Modify: `packages/protocol/src/index.ts`
- Create: `packages/protocol/test/attachments.test.ts`
- Modify: `apps/web/src/runtime/types.ts`
- Modify: `apps/gateway/src/routes/compile.ts`

**Step 1: Write the failing tests**
- Add protocol tests proving one shared helper can:
  - validate an image attachment payload
  - reject unsupported mime types and empty payloads
  - enforce conservative size limits and `data:image/...;base64,...` transport shape
- Extend the compile route typing surface so web/gateway both import the attachment schema/type from `@geohelper/protocol` instead of re-declaring shape locally.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/protocol test -- --run test/attachments.test.ts`
- Run: `pnpm exec tsc -p apps/web/tsconfig.json --noEmit`
- Run: `pnpm exec tsc -p apps/gateway/tsconfig.json --noEmit`
- Expected: FAIL because the shared attachment module does not exist yet.

**Step 3: Write the minimal implementation**
- Add a protocol module exporting:
  - `ImageAttachmentSchema`
  - `RuntimeAttachmentSchema`
  - `MAX_IMAGE_ATTACHMENT_BYTES`
  - `parseRuntimeAttachments(value)`
- Restrict V6 scope to image attachments only.
- Update web runtime types and gateway route parsing to import the shared types/schemas.

**Step 4: Run the tests to verify they pass**
- Run the same three commands from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add packages/protocol/src/attachments.ts packages/protocol/src/index.ts packages/protocol/test/attachments.test.ts apps/web/src/runtime/types.ts apps/gateway/src/routes/compile.ts
git commit -m "refactor: share runtime attachment contract"
```

---

### Task 2: Add explicit gateway vision capability config and runtime identity surface

**Files:**
- Modify: `apps/gateway/src/config.ts`
- Modify: `apps/gateway/src/services/build-info.ts`
- Modify: `apps/gateway/src/routes/admin.ts`
- Modify: `apps/gateway/test/admin-routes.test.ts`
- Modify: `apps/gateway/test/config.test.ts`
- Modify: `apps/web/src/runtime/types.ts`

**Step 1: Write the failing tests**
- Add config tests proving the gateway can parse a new explicit capability flag such as:
  - `GATEWAY_ENABLE_ATTACHMENTS=1`
  - optional image size limit env if needed
- Add admin/build identity tests proving `/admin/version` exposes whether attachment support is enabled.
- Add runtime type expectations for a gateway capability bit that can be surfaced to the web.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/config.test.ts test/admin-routes.test.ts`
- Expected: FAIL because gateway config/build identity does not expose attachment capability yet.

**Step 3: Write the minimal implementation**
- Add one explicit gateway config flag for image attachments.
- Include the capability in build/runtime identity responses so operators and the web can reason about vision support deterministically.
- Do not infer support purely from model name on the server side.

**Step 4: Run the tests to verify they pass**
- Run the same gateway tests from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/config.ts apps/gateway/src/services/build-info.ts apps/gateway/src/routes/admin.ts apps/gateway/test/admin-routes.test.ts apps/gateway/test/config.test.ts apps/web/src/runtime/types.ts
git commit -m "feat: expose gateway attachment capability"
```

---

### Task 3: Replace the gateway hard reject path with validated attachment pass-through

**Files:**
- Modify: `apps/gateway/src/routes/compile.ts`
- Modify: `apps/gateway/src/services/multi-agent.ts`
- Modify: `apps/gateway/src/services/metrics.ts`
- Modify: `apps/gateway/src/services/compile-events.ts`
- Modify: `apps/gateway/test/compile.test.ts`
- Modify: `apps/gateway/test/contract-smoke.test.ts`

**Step 1: Write the failing tests**
- Replace the existing attachment rejection test with two focused expectations:
  - attachments are still rejected when gateway attachment support is disabled
  - attachments are accepted and forwarded when support is enabled
- Add metrics / compile event assertions proving attachment-bearing requests are traceable without logging raw base64 content.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/compile.test.ts test/contract-smoke.test.ts`
- Expected: FAIL because the route still always returns `ATTACHMENTS_UNSUPPORTED`.

**Step 3: Write the minimal implementation**
- Gate attachment acceptance behind the explicit config flag from Task 2.
- Validate attachments with the shared protocol schema.
- Forward only validated attachment metadata + transport payload into the compile service path.
- Record an operator event/metric that attachments were present, but never log raw `transportPayload`.

**Step 4: Run the tests to verify they pass**
- Run the same gateway tests from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/routes/compile.ts apps/gateway/src/services/multi-agent.ts apps/gateway/src/services/metrics.ts apps/gateway/src/services/compile-events.ts apps/gateway/test/compile.test.ts apps/gateway/test/contract-smoke.test.ts
git commit -m "feat: allow gateway image attachments"
```

---

### Task 4: Surface gateway attachment capability to the web runtime resolver

**Files:**
- Modify: `apps/web/src/state/settings-store.ts`
- Modify: `apps/web/src/state/settings-store.test.ts`
- Modify: `apps/web/src/runtime/runtime-service.ts`
- Modify: `apps/web/src/runtime/orchestrator.ts`
- Modify: `apps/web/src/runtime/orchestrator.test.ts`
- Modify: `apps/web/src/runtime/gateway-client.ts`
- Modify: `apps/web/src/runtime/gateway-client.test.ts`

**Step 1: Write the failing tests**
- Add web tests proving runtime capability resolution can distinguish:
  - direct runtime with model-derived vision support
  - gateway runtime with explicit server-advertised attachment support
  - gateway runtime with attachment support disabled
- Add orchestrator/client tests showing attachment-bearing compile requests are allowed only when the resolved runtime capability says vision is available.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/web test -- --run src/state/settings-store.test.ts src/runtime/orchestrator.test.ts src/runtime/gateway-client.test.ts`
- Expected: FAIL because gateway vision capability is still static / not server-informed enough.

**Step 3: Write the minimal implementation**
- Keep direct-runtime vision logic as-is.
- Add a small gateway capability fetch/cache path that can hydrate attachment support from runtime identity when appropriate.
- Prevent UI/runtime from sending image attachments through gateway when gateway capability says attachments are unavailable.
- Preserve backwards compatibility when the gateway identity endpoint is unavailable.

**Step 4: Run the tests to verify they pass**
- Run the same web tests from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/web/src/state/settings-store.ts apps/web/src/state/settings-store.test.ts apps/web/src/runtime/runtime-service.ts apps/web/src/runtime/orchestrator.ts apps/web/src/runtime/orchestrator.test.ts apps/web/src/runtime/gateway-client.ts apps/web/src/runtime/gateway-client.test.ts
git commit -m "feat: resolve gateway vision capability"
```

---

### Task 5: Tighten composer behavior for gateway attachment capability states

**Files:**
- Modify: `apps/web/src/components/ChatPanel.tsx`
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/state/chat-store.ts`
- Modify: `apps/web/src/state/chat-store.test.ts`
- Modify: `tests/e2e/chat-to-render.spec.ts`

**Step 1: Write the failing tests**
- Extend state and E2E tests to prove:
  - gateway mode can attach and send images when capability is enabled
  - gateway mode disables image upload with clear messaging when capability is disabled
  - existing direct-mode attachment flows remain unchanged
- Add one chat-store test proving user-facing fallback messaging is clear when an attachment-bearing request is blocked before compile.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/web test -- --run src/state/chat-store.test.ts`
- Run: `pnpm test:e2e -- --grep "composer|attachment|vision"`
- Expected: FAIL because gateway capability-specific composer behavior is incomplete.

**Step 3: Write the minimal implementation**
- Reuse the current composer attachment UI.
- Gate only on resolved runtime capability, not on ad-hoc string checks in the component.
- Keep user messaging explicit: unavailable due to runtime capability, not generic upload failure.

**Step 4: Run the tests to verify they pass**
- Run the same commands from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/web/src/components/ChatPanel.tsx apps/web/src/components/WorkspaceShell.tsx apps/web/src/state/chat-store.ts apps/web/src/state/chat-store.test.ts tests/e2e/chat-to-render.spec.ts
git commit -m "feat: gate composer attachments by runtime capability"
```

---

### Task 6: Add operator-facing smoke coverage for gateway attachment support

**Files:**
- Modify: `scripts/smoke/gateway-runtime.mjs`
- Create: `tests/workspace/gateway-runtime-vision-smoke.test.ts`
- Modify: `tests/workspace/gateway-ops-runner.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing tests**
- Add a workspace test proving gateway smoke can describe an optional attachment/vision check in dry-run mode.
- Assert the smoke script can consume a mock attachment-capable runtime identity and emit deterministic check metadata without requiring a real image upload in workspace tests.
- Extend ops runner tests if the smoke manifest gains an attachment-specific artifact field or step name.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm exec vitest run tests/workspace/gateway-runtime-vision-smoke.test.ts tests/workspace/gateway-ops-runner.test.ts`
- Expected: FAIL because smoke coverage does not include gateway attachment verification yet.

**Step 3: Write the minimal implementation**
- Add one optional smoke check that verifies attachment capability and a sample attachment-bearing compile path when the gateway advertises support.
- Keep dry-run deterministic and machine-readable.
- Avoid bundling large binary fixtures into workspace tests; use synthetic payload stubs.

**Step 4: Run the tests to verify they pass**
- Run the same commands from Step 2.
- Run: `pnpm smoke:gateway-runtime -- --dry-run`
- Expected: PASS.

**Step 5: Commit**
```bash
git add scripts/smoke/gateway-runtime.mjs tests/workspace/gateway-runtime-vision-smoke.test.ts tests/workspace/gateway-ops-runner.test.ts package.json README.md docs/deploy/edgeone.md
git commit -m "feat: cover gateway vision in smoke checks"
```

---

### Task 7: Add benchmark and release-gate treatment for attachment capability

**Files:**
- Modify: `scripts/bench/run-quality-benchmark.mjs`
- Modify: `tests/workspace/benchmark-runner.test.ts`
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `README.md`
- Modify: `docs/user/settings-backup-recovery.md`

**Step 1: Write the failing tests**
- Extend benchmark/doc tests so the repo expects:
  - explicit wording that gateway attachment support is a gated capability
  - release guidance covering what blocks promotion when vision smoke fails
- Add one benchmark runner test if attachment-capable runs emit additional metadata.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm exec vitest run tests/workspace/benchmark-runner.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/beta-checklist.test.ts`
- Expected: FAIL because release docs and benchmark wording do not describe gateway attachment capability yet.

**Step 3: Write the minimal implementation**
- Update docs so operators know:
  - attachment support is explicit, not implied
  - vision smoke failures block promotion when the deployment intends to support image input
  - direct runtime and gateway runtime can legitimately differ in vision support
- Keep backup/recovery docs concise; do not turn them into general media docs.

**Step 4: Run the tests to verify they pass**
- Run the same tests from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add scripts/bench/run-quality-benchmark.mjs tests/workspace/benchmark-runner.test.ts docs/BETA_CHECKLIST.md README.md docs/user/settings-backup-recovery.md
git commit -m "docs: add gateway vision release gates"
```

---

### Task 8: Final V6 verification and merge gate

**Files:**
- Verify: `packages/protocol/**`
- Verify: `apps/gateway/**`
- Verify: `apps/web/**`
- Verify: `scripts/**`
- Verify: `tests/**`

**Step 1: Run protocol + gateway tests**
- Run: `pnpm --filter @geohelper/protocol test`
- Run: `pnpm --filter @geohelper/gateway test`
- Expected: PASS.

**Step 2: Run focused web tests**
- Run: `pnpm --filter @geohelper/web test -- --run src/state/chat-store.test.ts src/state/settings-store.test.ts src/runtime/orchestrator.test.ts src/runtime/gateway-client.test.ts src/runtime/direct-client.test.ts src/components/settings-remote-backup.test.ts`
- Expected: PASS.

**Step 3: Run workspace script/doc tests**
- Run: `pnpm exec vitest run tests/workspace/gateway-ops-runner.test.ts tests/workspace/gateway-ops-scheduled.test.ts tests/workspace/gateway-backup-restore.test.ts tests/workspace/gateway-runtime-vision-smoke.test.ts tests/workspace/benchmark-runner.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/beta-checklist.test.ts`
- Expected: PASS.

**Step 4: Run build + typecheck + E2E slice**
- Run: `pnpm typecheck`
- Run: `pnpm --filter @geohelper/web build`
- Run: `pnpm test:e2e -- --grep "composer|attachment|vision"`
- Expected: PASS.

**Step 5: Run dry-run operator commands**
- Run: `pnpm ops:gateway:verify -- --dry-run`
- Run: `pnpm ops:gateway:scheduled -- --dry-run`
- Run: `pnpm smoke:gateway-runtime -- --dry-run`
- Run: `pnpm smoke:gateway-backup-restore -- --dry-run`
- Expected: PASS.

**Step 6: Commit / handoff**
```bash
git status
git log --oneline --decorate -8
```
- If all verification passes, hand off to `superpowers:finishing-a-development-branch` for merge / push workflow.

---

## Delivery Notes

- Favor shared protocol schemas and capability flags over duplicating attachment validation in web and gateway.
- Do not introduce persistent media storage or async upload orchestration in V6.
- Keep operator observability privacy-safe: no raw base64 payloads in logs, alerts, traces, manifests, or metrics.
- If a task starts drifting into generalized multimodal product design, stop and split a later roadmap rather than widening V6.
