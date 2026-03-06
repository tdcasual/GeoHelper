import { runSyncBundle } from "./lib/sync-orchestrator.mjs";

try {
  const manifest = await runSyncBundle();
  console.log(
    `[geogebra:sync] resolved ${manifest.resolvedVersion} from ${manifest.resolvedFrom}`
  );
  console.log(
    `[geogebra:sync] codebase ${manifest.html5CodebasePath}`
  );
} catch (error) {
  console.error("[geogebra:sync] failed", error);
  process.exitCode = 1;
}
