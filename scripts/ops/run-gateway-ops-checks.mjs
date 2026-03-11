#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const parseArgs = (argv) => {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--help" || token === "-h") {
      parsed.help = true;
      continue;
    }

    if (token === "--dry-run") {
      parsed["dry-run"] = true;
      continue;
    }

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];

    if (!value || value.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = value;
    index += 1;
  }

  return parsed;
};

const buildSteps = () => [
  {
    name: "gateway_smoke",
    command: "pnpm smoke:gateway-runtime -- --dry-run",
    script: "smoke:gateway-runtime",
    dryRunArgs: ["--", "--dry-run"]
  },
  {
    name: "quality_benchmark",
    command: "pnpm bench:quality -- --dry-run",
    script: "bench:quality",
    dryRunArgs: ["--", "--dry-run"]
  }
];

const printHelp = () => {
  console.log(
    [
      "Usage: node scripts/ops/run-gateway-ops-checks.mjs [options]",
      "",
      "Options:",
      "  --dry-run                 Print the planned ops checks without running them",
      "  --help                    Show this help"
    ].join("\n")
  );
};

const parseJsonMaybe = (value) => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export async function runGatewayOpsChecks({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout
} = {}) {
  const args = parseArgs(argv);
  const steps = buildSteps();

  if (args.help) {
    printHelp();
    return 0;
  }

  if (args["dry-run"]) {
    stdout.write(
      JSON.stringify(
        {
          dry_run: true,
          output_dir: null,
          steps: steps.map((step) => ({
            name: step.name,
            command: step.command
          }))
        },
        null,
        2
      ) + "\n"
    );
    return 0;
  }

  const results = [];
  let exitCode = 0;

  for (const step of steps) {
    const run = spawnSync("pnpm", [step.script], {
      encoding: "utf8",
      env,
      cwd: process.cwd()
    });
    const payload = parseJsonMaybe(run.stdout.trim());
    results.push({
      name: step.name,
      command: `pnpm ${step.script}`,
      ok: run.status === 0,
      exit_code: run.status ?? 1,
      output: payload
    });

    if (run.status !== 0) {
      exitCode = run.status ?? 1;
      break;
    }
  }

  stdout.write(
    JSON.stringify(
      {
        dry_run: false,
        output_dir: null,
        steps: results
      },
      null,
      2
    ) + "\n"
  );
  return exitCode;
}

const isMainModule = (() => {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  return import.meta.url === new URL(`file://${entry}`).href;
})();

if (isMainModule) {
  runGatewayOpsChecks().then(
    (code) => {
      process.exit(code);
    },
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  );
}
