#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  exportOpenClawBundleFromBundleDir,
  smokeImportOpenClawWorkspace
} from "../../packages/agent-export-openclaw/src/index.ts";

const repoRoot = path.resolve(
  fileURLToPath(new URL("../..", import.meta.url))
);

const bundleIdArg = process.argv[2]?.trim();
const outputDirArg = process.argv[3]?.trim();

if (!bundleIdArg) {
  console.error("Usage: smoke-openclaw-export.mjs <bundle-id> [output-dir]");
  process.exit(1);
}

const bundleDir = path.resolve(repoRoot, "agents", bundleIdArg);
const outputDir = outputDirArg
  ? path.resolve(process.cwd(), outputDirArg)
  : path.resolve(repoRoot, "exports", "openclaw", bundleIdArg);

const exported = exportOpenClawBundleFromBundleDir({
  bundleDir,
  outputDir
});
const smoke = smokeImportOpenClawWorkspace({
  workspaceDir: exported.outputDir
});

console.log(
  JSON.stringify(
    {
      bundleId: smoke.bundleId,
      outputDir: exported.outputDir,
      reportPath: path.join(exported.outputDir, "export-report.json"),
      smoke
    },
    null,
    2
  )
);
