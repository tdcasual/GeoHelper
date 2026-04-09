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

const args = process.argv.slice(2);
const verifyImport = args.includes("--verify-import");
const positionalArgs = args.filter((arg) => arg !== "--verify-import");
const bundleIdArg = positionalArgs[0]?.trim();
const outputDirArg = positionalArgs[1]?.trim();

if (!bundleIdArg) {
  console.error(
    "Usage: export-openclaw-bundle.mjs <bundle-id> [output-dir] [--verify-import]"
  );
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
const smoke = verifyImport
  ? smokeImportOpenClawWorkspace({
      workspaceDir: result.outputDir
    })
  : null;

console.log(
  JSON.stringify(
    {
      bundleId: result.report.bundleId,
      outputDir: result.outputDir,
      reportPath: path.join(result.outputDir, "export-report.json"),
      audit: {
        bundleId: result.report.bundleId,
        rehearsedExtractionCandidate:
          result.report.rehearsedExtractionCandidate,
        extractionBlockers: result.report.extractionBlockers,
        verifyImport: smoke
          ? {
              bundleId: smoke.bundleId,
              workflowId: smoke.workflowId,
              cleanExternalMoveReady: smoke.cleanExternalMoveReady,
              extractionBlockers: smoke.extractionBlockers
            }
          : null
      },
      ...(smoke
        ? {
            smoke
          }
        : {})
    },
    null,
    2
  )
);
