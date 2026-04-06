import { createGeometryWorkerRuntime, createWorkerStoreFromEnv } from "./worker";

const printUsage = (): void => {
  process.stdout.write(`GeoHelper worker\n\n`);
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  pnpm --filter @geohelper/worker start\n`);
  process.stdout.write(`  pnpm --filter @geohelper/worker start -- --once\n\n`);
  process.stdout.write(`Environment:\n`);
  process.stdout.write(
    `  GEOHELPER_AGENT_STORE_SQLITE_PATH  Shared SQLite ledger path for control-plane and worker\n`
  );
  process.stdout.write(
    `  GEOHELPER_WORKER_POLL_INTERVAL_MS  Poll interval in milliseconds (default: 1000)\n`
  );
};

const sleep = async (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });

const main = async (): Promise<void> => {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  const runOnce = process.argv.includes("--once");
  const pollIntervalMs = Math.max(
    100,
    Number(process.env.GEOHELPER_WORKER_POLL_INTERVAL_MS ?? 1000)
  );
  const store = createWorkerStoreFromEnv();
  const runtime = createGeometryWorkerRuntime({
    store
  });

  let stopping = false;
  const stop = (): void => {
    stopping = true;
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopping) {
    const result = await runtime.runLoop.tick();

    if (runOnce) {
      return;
    }

    if (!result) {
      await sleep(pollIntervalMs);
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
