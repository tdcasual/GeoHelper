#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { exportOpenClawBundleFromBundleDir } from "../../packages/agent-export-openclaw/src/export-openclaw-bundle.ts";

const repoRoot = path.resolve(
  fileURLToPath(new URL("../..", import.meta.url))
);

const bundleIdArg = process.argv[2]?.trim();
const outputDirArg = process.argv[3]?.trim();

if (!bundleIdArg) {
  console.error("Usage: export-openclaw-bundle.mjs <bundle-id> [output-dir]");
  process.exit(1);
}

const bundleDir = path.resolve(repoRoot, "agents", bundleIdArg);
const outputDir = outputDirArg
  ? path.resolve(process.cwd(), outputDirArg)
  : path.resolve(repoRoot, "exports", "openclaw", bundleIdArg);

const result = exportOpenClawBundleFromBundleDir({
  bundleDir,
  outputDir
});

console.log(
  JSON.stringify(
    {
      bundleId: result.report.bundleId,
      outputDir: result.outputDir,
      reportPath: path.join(result.outputDir, "export-report.json")
    },
    null,
    2
  )
);
