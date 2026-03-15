# Gateway GHCR Automation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically build and publish the `apps/gateway` container image to GHCR after successful `main` branch CI, while keeping runtime deployment manual.

**Architecture:** Add a dedicated GitHub Actions workflow that triggers from the existing quality workflow and only publishes after it succeeds on `main`. Keep the image name aligned with the deploy docs (`ghcr.io/<owner>/geohelper-gateway`), publish a stable `staging` tag plus an immutable `sha-*` tag, and update docs/tests so the release contract stays enforced.

**Tech Stack:** GitHub Actions, Docker Buildx, GHCR, Vitest workspace tests, Markdown deploy docs.

---

### Task 1: Lock the release contract with failing tests

**Files:**
- Modify: `tests/workspace/deploy-docs.test.ts`
- Modify: `tests/workspace/geogebra-deploy-automation.test.ts`
- Test: `tests/workspace/deploy-docs.test.ts`
- Test: `tests/workspace/geogebra-deploy-automation.test.ts`

**Step 1: Write the failing test**

Add assertions that require:
- a dedicated GHCR workflow file under `.github/workflows/`
- workflow content that waits for `CI Quality Gate`
- `ghcr.io` / `geohelper-gateway`
- `staging` and `sha-` tags
- deploy docs explaining that image publish is automated but deployment remains manual

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/workspace/deploy-docs.test.ts tests/workspace/geogebra-deploy-automation.test.ts`

Expected: FAIL because the workflow file and updated doc language do not exist yet.

### Task 2: Add the GHCR publish workflow

**Files:**
- Create: `.github/workflows/gateway-image.yml`

**Step 1: Write minimal implementation**

Create a workflow that:
- triggers on `workflow_run` for `CI Quality Gate`
- only proceeds when the upstream workflow concluded successfully on `main`
- logs in to GHCR with `GITHUB_TOKEN`
- builds `apps/gateway/Dockerfile` with `build-context repo=.`
- pushes `ghcr.io/${owner}/geohelper-gateway:staging`
- pushes `ghcr.io/${owner}/geohelper-gateway:sha-<shortsha>`
- passes `GEOHELPER_BUILD_SHA` and `GEOHELPER_BUILD_TIME`

**Step 2: Run test to verify it passes**

Run: `pnpm exec vitest run tests/workspace/geogebra-deploy-automation.test.ts`

Expected: PASS.

### Task 3: Update deploy docs to match the new release contract

**Files:**
- Modify: `README.md`
- Modify: `docs/deploy/edgeone.md`
- Test: `tests/workspace/deploy-docs.test.ts`

**Step 1: Write minimal implementation**

Update docs to say:
- web deploy remains manual
- gateway image build/publish to GHCR is automated after successful `main` CI
- gateway runtime deployment is still manual
- published tags and package path operators should expect

**Step 2: Run test to verify it passes**

Run: `pnpm exec vitest run tests/workspace/deploy-docs.test.ts`

Expected: PASS.

### Task 4: Verify the workflow and docs end-to-end

**Files:**
- Verify: `.github/workflows/gateway-image.yml`
- Verify: `README.md`
- Verify: `docs/deploy/edgeone.md`

**Step 1: Run focused verification**

Run: `pnpm exec vitest run tests/workspace/deploy-docs.test.ts tests/workspace/geogebra-deploy-automation.test.ts`

Expected: PASS.

**Step 2: Parse the workflow YAML**

Run: `ruby -e 'require \"yaml\"; YAML.load_file(\".github/workflows/gateway-image.yml\"); puts \"yaml ok\"'`

Expected: prints `yaml ok`.

**Step 3: Review the final diff**

Run: `git diff -- .github/workflows/gateway-image.yml README.md docs/deploy/edgeone.md tests/workspace/deploy-docs.test.ts tests/workspace/geogebra-deploy-automation.test.ts`

Expected: workflow and docs describe the same contract.
