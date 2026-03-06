# GeoGebra Self-Hosted Latest-with-Fallback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the runtime GeoGebra CDN dependency with a build-time synced, fully self-hosted GeoGebra bundle that prefers the latest official release, falls back safely when needed, and renders with stable full-height sizing in the static web app.

**Architecture:** Add a build-time vendor pipeline that resolves the latest GeoGebra Math Apps Bundle, validates and publishes it into `apps/web/public/vendor/geogebra/current/`, and records a local manifest with version and source metadata. Refactor the frontend GeoGebra bootstrap to read that manifest, load only local assets, set the local HTML5 codebase before injection, and initialize the applet with measured pixel dimensions rather than percentage dimensions.

**Tech Stack:** `pnpm` workspaces, Node.js ESM scripts, React + Vite + TypeScript, Vitest, Playwright.

---

## Implementation Rules

- Follow DRY + YAGNI.
- Apply TDD in each task: failing test -> minimal implementation -> passing test.
- Keep commits small and frequent.
- Prefer extracting pure helper functions before touching browser/runtime glue.
- Skills to apply during execution: `@test-driven-development`, `@systematic-debugging`, `@verification-before-completion`, `@requesting-code-review`.
- Execute this plan in an isolated worktree if one is not already in use.

## Current Repository Anchors

- Runtime GeoGebra entry: `apps/web/src/components/CanvasPanel.tsx`
- GeoGebra host styles: `apps/web/src/styles.css`
- Root build scripts: `package.json`
- Deploy docs: `docs/deploy/edgeone.md`
- Workspace docs tests: `tests/workspace/deploy-docs.test.ts`
- Browser tests: `tests/e2e/geogebra-mount.spec.ts`

## Target Files and Folders

- `config/geogebra.vendor.json`
- `scripts/geogebra/sync-bundle.mjs`
- `scripts/geogebra/assert-no-external.mjs`
- `scripts/geogebra/lib/*.mjs`
- `apps/web/public/vendor/geogebra/manifest.json` (generated)
- `apps/web/src/geogebra/*.ts`
- `apps/web/src/components/CanvasPanel.tsx`
- `tests/workspace/*.test.ts`
- `tests/e2e/geogebra-self-hosted.spec.ts`
- `README.md`
- `docs/deploy/edgeone.md`

## Task 1: Add vendor config and config loader

**Files:**
- Create: `config/geogebra.vendor.json`
- Create: `scripts/geogebra/lib/read-vendor-config.mjs`
- Test: `tests/workspace/geogebra-vendor-config.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { readVendorConfig } from "../../scripts/geogebra/lib/read-vendor-config.mjs";

describe("readVendorConfig", () => {
  it("loads required latest and fallback settings", async () => {
    const config = await readVendorConfig();
    expect(config.latestBundleUrl).toBe(
      "https://download.geogebra.org/package/geogebra-math-apps-bundle"
    );
    expect(config.fallbackVersion).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(config.fallbackBundleUrl).toContain(config.fallbackVersion.replace(/\./g, "-"));
    expect(config.allowCachedLastKnownGood).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest tests/workspace/geogebra-vendor-config.test.ts`
Expected: FAIL because config file and loader do not exist yet.

**Step 3: Write minimal implementation**

- Add `config/geogebra.vendor.json` with:
  - `latestBundleUrl`
  - `fallbackVersion`
  - `fallbackBundleUrl`
  - `requestTimeoutMs`
  - `allowCachedLastKnownGood`
  - `expectedEntries`
- Implement `readVendorConfig()` to read, parse, and validate the config.
- Fail fast with a descriptive error when any required key is missing.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest tests/workspace/geogebra-vendor-config.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add config/geogebra.vendor.json scripts/geogebra/lib/read-vendor-config.mjs tests/workspace/geogebra-vendor-config.test.ts
git commit -m "chore: add geogebra vendor config loader"
```

## Task 2: Add latest bundle resolution and version parsing

**Files:**
- Create: `scripts/geogebra/lib/resolve-bundle-source.mjs`
- Test: `tests/workspace/geogebra-bundle-source.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseBundleSource } from "../../scripts/geogebra/lib/resolve-bundle-source.mjs";

describe("parseBundleSource", () => {
  it("extracts a dotted version from the redirected zip url", () => {
    const source = parseBundleSource(
      "https://download.geogebra.org/installers/5.4/geogebra-math-apps-bundle-5-4-918-0.zip"
    );

    expect(source.version).toBe("5.4.918.0");
    expect(source.filename).toBe("geogebra-math-apps-bundle-5-4-918-0.zip");
  });

  it("throws on an unexpected zip filename", () => {
    expect(() => parseBundleSource("https://example.com/not-a-geogebra.zip")).toThrow(
      /bundle version/
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest tests/workspace/geogebra-bundle-source.test.ts`
Expected: FAIL because parser is not implemented.

**Step 3: Write minimal implementation**

- Implement `parseBundleSource(url)` to:
  - extract the final filename
  - derive `major.minor.patch.build` from the hyphenated zip name
  - return `{ version, filename, url }`
- Add `resolveBundleSource(fetchImpl, latestBundleUrl)` that follows redirects and returns the parsed final source.
- Keep network access injectable for later orchestration tests.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest tests/workspace/geogebra-bundle-source.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/geogebra/lib/resolve-bundle-source.mjs tests/workspace/geogebra-bundle-source.test.ts
git commit -m "feat: parse geogebra bundle versions from latest source"
```

## Task 3: Add bundle validation and manifest generation helpers

**Files:**
- Create: `scripts/geogebra/lib/validate-bundle.mjs`
- Create: `scripts/geogebra/lib/write-vendor-manifest.mjs`
- Test: `tests/workspace/geogebra-bundle-validation.test.ts`

**Step 1: Write the failing test**

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectBundleLayout,
  buildVendorManifest,
} from "../../scripts/geogebra/lib/validate-bundle.mjs";

describe("detectBundleLayout", () => {
  it("finds deployggb.js and the html5 web3d codebase", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ggb-layout-"));
    await fs.mkdir(path.join(root, "HTML5", "5.2.918.0", "web3d", "js"), {
      recursive: true,
    });
    await fs.writeFile(path.join(root, "deployggb.js"), "window.GGBApplet = function(){};");
    await fs.writeFile(
      path.join(root, "HTML5", "5.2.918.0", "web3d", "js", "properties_keys_zh-CN.js"),
      ""
    );

    const layout = await detectBundleLayout(root);
    const manifest = buildVendorManifest({
      version: "5.4.918.0",
      resolvedFrom: "latest",
      sourceUrl: "https://download.geogebra.org/installers/5.4/geogebra-math-apps-bundle-5-4-918-0.zip",
      publishRoot: "/vendor/geogebra/current",
      layout,
    });

    expect(layout.deployScriptRelativePath).toBe("deployggb.js");
    expect(layout.html5CodebaseRelativePath).toBe("HTML5/5.2.918.0/web3d/");
    expect(manifest.html5CodebasePath).toBe(
      "/vendor/geogebra/current/HTML5/5.2.918.0/web3d/"
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest tests/workspace/geogebra-bundle-validation.test.ts`
Expected: FAIL because bundle validation helpers do not exist.

**Step 3: Write minimal implementation**

- Implement `detectBundleLayout(rootDir)` to verify:
  - `deployggb.js`
  - a single `HTML5/*/web3d/` path
  - at least one known JS/CSS asset
- Implement `buildVendorManifest()` returning:
  - `resolvedVersion`
  - `resolvedFrom`
  - `sourceUrl`
  - `deployScriptPath`
  - `html5CodebasePath`
  - `builtAt`
  - `integritySummary`
- Implement `writeVendorManifest(filePath, manifest)` as a tiny serialization helper.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest tests/workspace/geogebra-bundle-validation.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/geogebra/lib/validate-bundle.mjs scripts/geogebra/lib/write-vendor-manifest.mjs tests/workspace/geogebra-bundle-validation.test.ts
git commit -m "feat: validate geogebra bundle layout and manifest output"
```

## Task 4: Implement sync orchestration with latest -> fallback -> last-known-good

**Files:**
- Create: `scripts/geogebra/sync-bundle.mjs`
- Create: `scripts/geogebra/lib/sync-orchestrator.mjs`
- Modify: `package.json`
- Modify: `.gitignore`
- Test: `tests/workspace/geogebra-sync-orchestrator.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { syncWithFallbacks } from "../../scripts/geogebra/lib/sync-orchestrator.mjs";

describe("syncWithFallbacks", () => {
  it("falls back to the configured fallback source when latest fails", async () => {
    const attempts: string[] = [];

    const result = await syncWithFallbacks({
      tryLatest: async () => {
        attempts.push("latest");
        throw new Error("latest failed");
      },
      tryFallback: async () => {
        attempts.push("fallback");
        return { resolvedVersion: "5.4.918.0", resolvedFrom: "fallback" };
      },
      tryLastKnownGood: async () => {
        attempts.push("last-known-good");
        return { resolvedVersion: "5.4.917.0", resolvedFrom: "last-known-good" };
      },
    });

    expect(attempts).toEqual(["latest", "fallback"]);
    expect(result.resolvedFrom).toBe("fallback");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest tests/workspace/geogebra-sync-orchestrator.test.ts`
Expected: FAIL because orchestration helpers do not exist.

**Step 3: Write minimal implementation**

- Implement `syncWithFallbacks()` with the exact fallback order:
  - latest
  - configured fallback version
  - cached last-known-good
- Implement the CLI entry script `scripts/geogebra/sync-bundle.mjs` to:
  - read config
  - resolve latest source
  - download and extract archive
  - validate layout
  - publish into `apps/web/public/vendor/geogebra/current/`
  - write `manifest.json`
  - update `.cache/geogebra/last-known-good.json`
- Add root scripts:
  - `geogebra:sync`
  - `build:web`
- Ignore `.cache/geogebra/` in `.gitignore`.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest tests/workspace/geogebra-sync-orchestrator.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/geogebra/sync-bundle.mjs scripts/geogebra/lib/sync-orchestrator.mjs package.json .gitignore tests/workspace/geogebra-sync-orchestrator.test.ts
git commit -m "feat: add geogebra bundle sync orchestration with fallback chain"
```

## Task 5: Add frontend vendor manifest helpers

**Files:**
- Create: `apps/web/src/geogebra/vendor-runtime.ts`
- Test: `apps/web/src/geogebra/vendor-runtime.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  resolveVendorAssetUrl,
  toGeoGebraRuntimeConfig,
} from "./vendor-runtime";

describe("toGeoGebraRuntimeConfig", () => {
  it("prefixes vendor asset paths with the Vite base url", () => {
    const runtime = toGeoGebraRuntimeConfig(
      {
        deployScriptPath: "/vendor/geogebra/current/deployggb.js",
        html5CodebasePath: "/vendor/geogebra/current/HTML5/5.2.918.0/web3d/",
      },
      "/geohelper/"
    );

    expect(runtime.deployScriptUrl).toBe(
      "/geohelper/vendor/geogebra/current/deployggb.js"
    );
    expect(runtime.html5CodebaseUrl).toBe(
      "/geohelper/vendor/geogebra/current/HTML5/5.2.918.0/web3d/"
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- src/geogebra/vendor-runtime.test.ts`
Expected: FAIL because vendor runtime helpers do not exist.

**Step 3: Write minimal implementation**

- Implement `resolveVendorAssetUrl(baseUrl, absoluteAssetPath)`.
- Implement `toGeoGebraRuntimeConfig(manifest, baseUrl)`.
- Keep these helpers pure and DOM-free.
- Do not fetch the manifest in this task; only build normalized runtime URLs.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- src/geogebra/vendor-runtime.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/geogebra/vendor-runtime.ts apps/web/src/geogebra/vendor-runtime.test.ts
git commit -m "feat(web): add geogebra vendor runtime helpers"
```

## Task 6: Refactor `CanvasPanel` to local self-hosting and stable pixel sizing

**Files:**
- Create: `apps/web/src/geogebra/applet-size.ts`
- Test: `apps/web/src/geogebra/applet-size.test.ts`
- Modify: `apps/web/src/components/CanvasPanel.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { toAppletPixelSize } from "./applet-size";

describe("toAppletPixelSize", () => {
  it("rounds host measurements down to safe integer applet dimensions", () => {
    expect(toAppletPixelSize({ width: 702.8, height: 1109.4 })).toEqual({
      width: 702,
      height: 1109,
    });
  });

  it("rejects unusable host dimensions", () => {
    expect(() => toAppletPixelSize({ width: 0, height: 10 })).toThrow(/host size/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- src/geogebra/applet-size.test.ts`
Expected: FAIL because sizing helper does not exist.

**Step 3: Write minimal implementation**

- Implement `toAppletPixelSize()` as a pure helper.
- Refactor `CanvasPanel.tsx` to:
  - fetch `/vendor/geogebra/manifest.json`
  - normalize local URLs using `import.meta.env.BASE_URL`
  - inject local `deployggb.js`
  - call `applet.setHTML5Codebase(runtime.html5CodebaseUrl)` before `inject()`
  - measure `.geogebra-host` and pass numeric pixel `width` and `height`
  - keep adapter registration behavior unchanged
- Update styles only if needed to ensure the host element exposes stable measurable height.

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/web test -- src/geogebra/applet-size.test.ts src/state/scene-store.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/geogebra/applet-size.ts apps/web/src/geogebra/applet-size.test.ts apps/web/src/components/CanvasPanel.tsx apps/web/src/styles.css
git commit -m "feat(web): self-host geogebra bootstrap and stabilize canvas sizing"
```

## Task 7: Add a build artifact guard against external GeoGebra references

**Files:**
- Create: `scripts/geogebra/assert-no-external.mjs`
- Test: `tests/workspace/geogebra-dist-guard.test.ts`
- Modify: `package.json`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { findExternalGeoGebraRefs } from "../../scripts/geogebra/assert-no-external.mjs";

describe("findExternalGeoGebraRefs", () => {
  it("reports geogebra.org references in emitted files", () => {
    const refs = findExternalGeoGebraRefs([
      { path: "dist/assets/app.js", content: "https://www.geogebra.org/apps/deployggb.js" },
    ]);

    expect(refs).toHaveLength(1);
    expect(refs[0].path).toBe("dist/assets/app.js");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest tests/workspace/geogebra-dist-guard.test.ts`
Expected: FAIL because the guard helper does not exist.

**Step 3: Write minimal implementation**

- Implement `findExternalGeoGebraRefs()` as a pure helper.
- Implement the CLI script to scan `apps/web/dist` after build and fail on any `geogebra.org` string.
- Add root script:
  - `verify:geogebra-self-hosted`

**Step 4: Run test to verify it passes**

Run: `pnpm vitest tests/workspace/geogebra-dist-guard.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/geogebra/assert-no-external.mjs tests/workspace/geogebra-dist-guard.test.ts package.json
git commit -m "test: add dist guard for external geogebra references"
```

## Task 8: Add browser regressions for zero external network and full-height canvas

**Files:**
- Create: `tests/e2e/geogebra-self-hosted.spec.ts`
- Modify: `tests/e2e/geogebra-mount.spec.ts`

**Step 1: Write the failing test**

```ts
import { expect, test } from "@playwright/test";

test("renders GeoGebra without any geogebra.org network access", async ({ page }) => {
  await page.route("**://www.geogebra.org/**", (route) => route.abort());
  await page.goto("/");

  await expect
    .poll(async () => {
      return page.locator("#geogebra-container").evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.height;
      });
    })
    .toBeGreaterThan(400);

  const resourceNames = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => name.includes("geogebra.org"))
  );

  expect(resourceNames).toEqual([]);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm playwright test tests/e2e/geogebra-self-hosted.spec.ts`
Expected: FAIL because the current app still depends on remote GeoGebra assets.

**Step 3: Write minimal implementation**

- Add the new spec exactly as the regression target.
- Keep `geogebra-mount.spec.ts` only as a narrow mount smoke test; do not overload it with deployment guarantees.
- If the spec flakes on first attempt, fix the app or polling, not by weakening the assertion below the visual safety threshold.

**Step 4: Run test to verify it passes**

Run: `pnpm playwright test tests/e2e/geogebra-self-hosted.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/e2e/geogebra-self-hosted.spec.ts tests/e2e/geogebra-mount.spec.ts
git commit -m "test(e2e): verify self-hosted geogebra and canvas height"
```

## Task 9: Update docs and release instructions for the new vendor pipeline

**Files:**
- Modify: `README.md`
- Modify: `docs/deploy/edgeone.md`
- Modify: `tests/workspace/deploy-docs.test.ts`

**Step 1: Write the failing test**

```ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("deploy docs", () => {
  it("documents geogebra self-hosted vendor sync before web build", () => {
    const txt = fs.readFileSync("docs/deploy/edgeone.md", "utf8");
    expect(txt).toContain("pnpm geogebra:sync");
    expect(txt).toContain("latest");
    expect(txt).toContain("fallback");
    expect(txt).toContain("vendor/geogebra/manifest.json");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest tests/workspace/deploy-docs.test.ts`
Expected: FAIL because the deploy docs do not mention the new vendor pipeline yet.

**Step 3: Write minimal implementation**

- Update `README.md` quick build/deploy instructions to include `pnpm geogebra:sync`.
- Update `docs/deploy/edgeone.md` to document:
  - latest-first bundle sync
  - fallback behavior
  - generated `vendor/geogebra/manifest.json`
  - post-build `verify:geogebra-self-hosted`
- Keep wording focused on operational steps, not internal implementation details.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest tests/workspace/deploy-docs.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add README.md docs/deploy/edgeone.md tests/workspace/deploy-docs.test.ts
git commit -m "docs: add self-hosted geogebra vendor deploy workflow"
```

## Task 10: Run the full verification matrix

**Files:**
- No new source files; verification only.

**Step 1: Run workspace tests**

Run: `pnpm vitest tests/workspace/geogebra-vendor-config.test.ts tests/workspace/geogebra-bundle-source.test.ts tests/workspace/geogebra-bundle-validation.test.ts tests/workspace/geogebra-sync-orchestrator.test.ts tests/workspace/geogebra-dist-guard.test.ts tests/workspace/deploy-docs.test.ts`
Expected: PASS.

**Step 2: Run web unit tests**

Run: `pnpm --filter @geohelper/web test -- src/geogebra/vendor-runtime.test.ts src/geogebra/applet-size.test.ts src/state/scene-store.test.ts`
Expected: PASS.

**Step 3: Run build and artifact guard**

Run: `pnpm geogebra:sync && pnpm --filter @geohelper/web build && pnpm verify:geogebra-self-hosted`
Expected: PASS. Output should report the resolved vendor version and no `geogebra.org` references.

**Step 4: Run browser regression**

Run: `pnpm playwright test tests/e2e/geogebra-self-hosted.spec.ts tests/e2e/geogebra-mount.spec.ts`
Expected: PASS.

**Step 5: Commit verification-safe final state**

```bash
git status --short
git log --oneline -5
```

Expected: only intended files changed; commit history reflects the task-by-task sequence above.

## Execution Notes

- Do not weaken the zero-external assertion by allowing a remote fallback at runtime; that would violate the design goal.
- Do not silently replace the latest-first policy with fixed-version-only behavior; if latest is too unstable, update the design and plan explicitly before changing policy.
- Prefer small helper modules under `scripts/geogebra/lib/` so the sync pipeline remains unit-testable without real network or full zip downloads.
- If archive extraction tooling becomes awkward, keep the entry script in Node ESM and use the smallest built-in or already-available dependency surface possible.

