#!/usr/bin/env node
import { spawnSync } from "node:child_process";

import { resolveOpsArtifactDir, writeJsonArtifact } from "./lib/artifact-paths.mjs";
import { evaluateOpsThresholds } from "./lib/evaluate-thresholds.mjs";

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
    artifactName: "smoke",
    command: "pnpm smoke:gateway-runtime -- --dry-run",
    script: "smoke:gateway-runtime",
    dryRunArgs: ["--", "--dry-run"],
    mockEnvKey: "OPS_MOCK_SMOKE_JSON"
  },
  {
    name: "quality_benchmark",
    artifactName: "benchmark",
    command: "pnpm bench:quality -- --dry-run",
    script: "bench:quality",
    dryRunArgs: ["--", "--dry-run"],
    mockEnvKey: "OPS_MOCK_BENCHMARK_JSON"
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

const asProbeList = (value) => (Array.isArray(value) ? value : []);

const buildDryRunPayload = (step) => {
  if (step.artifactName === "smoke") {
    return {
      dry_run: true,
      checks: []
    };
  }

  return {
    dry_run: true,
    success_rate: 1,
    by_domain: {}
  };
};

const runStep = ({ step, env, useDryRunSubcommands, useMockResults }) => {
  if (useMockResults) {
    return {
      status: 0,
      payload: parseJsonMaybe(env[step.mockEnvKey] ?? "null")
    };
  }

  if (useDryRunSubcommands) {
    return {
      status: 0,
      payload: buildDryRunPayload(step)
    };
  }

  const run = spawnSync(
    "pnpm",
    [step.script],
    {
      encoding: "utf8",
      env,
      cwd: process.cwd()
    }
  );

  return {
    status: run.status ?? 1,
    payload: parseJsonMaybe(run.stdout.trim())
  };
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

  const outputDir = await resolveOpsArtifactDir(env);
  const useDryRunSubcommands = env.OPS_USE_DRY_RUN_SUBCOMMANDS === "1";
  const useMockResults = env.OPS_USE_MOCK_RESULTS === "1";
  const results = [];
  let status = "ok";
  let exitCode = 0;
  let smokePayload = null;
  let benchmarkPayload = null;

  for (const step of steps) {
    const run = runStep({ step, env, useDryRunSubcommands, useMockResults });
    const artifactFile = await writeJsonArtifact(outputDir, step.artifactName, run.payload);
    results.push({
      name: step.name,
      command:
        useMockResults || useDryRunSubcommands ? step.command : `pnpm ${step.script}`,
      ok: run.status === 0,
      exit_code: run.status,
      artifact: artifactFile
    });

    if (step.artifactName === "smoke") {
      smokePayload = run.payload;
    }
    if (step.artifactName === "benchmark") {
      benchmarkPayload = run.payload;
    }

    if (run.status !== 0) {
      status = "failed";
      exitCode = run.status;
      break;
    }
  }

  const thresholdOutcome = evaluateOpsThresholds({
    smokeResult: smokePayload,
    benchmarkResult: benchmarkPayload,
    env
  });
  if (thresholdOutcome.status === "failed") {
    status = "failed";
    exitCode = exitCode || 1;
  }

  const summary = {
    dry_run: false,
    output_dir: outputDir,
    status,
    failure_reasons: thresholdOutcome.failureReasons,
    gateway_probes: asProbeList(smokePayload?.gateway_probes),
    control_plane_probes: asProbeList(smokePayload?.control_plane_probes),
    steps: results
  };
  const summaryFile = await writeJsonArtifact(outputDir, "summary", summary);
  const manifest = {
    status,
    artifacts: {
      smoke: "smoke.json",
      benchmark: "benchmark.json",
      summary: summaryFile
    }
  };
  await writeJsonArtifact(outputDir, "manifest", manifest);

  stdout.write(JSON.stringify(summary, null, 2) + "\n");
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
