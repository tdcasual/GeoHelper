#!/usr/bin/env node
import { runGatewayOpsChecks } from "./run-gateway-ops-checks.mjs";

const parseArgs = (argv) => {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") {
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

const buildPlan = (env, args) => ({
  dry_run: true,
  run_label: String(args["run-label"] ?? env.OPS_RUN_LABEL ?? "manual"),
  deployment: String(args.deployment ?? env.OPS_DEPLOYMENT ?? "unknown"),
  phases: [
    {
      name: "verify",
      command: "pnpm ops:gateway:verify"
    },
    {
      name: "publish_artifacts",
      enabled: env.OPS_PUBLISH_ARTIFACTS === "1"
    },
    {
      name: "notify",
      enabled: Boolean(env.OPS_NOTIFY_WEBHOOK_URL)
    }
  ]
});

export async function runScheduledGatewayVerify({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout
} = {}) {
  const args = parseArgs(argv);

  if (args["dry-run"]) {
    stdout.write(JSON.stringify(buildPlan(env, args), null, 2) + "\n");
    return 0;
  }

  let verifyOutput = "";
  const exitCode = await runGatewayOpsChecks({
    env,
    stdout: {
      write: (chunk) => {
        verifyOutput += String(chunk);
        return true;
      }
    }
  });
  const verify = JSON.parse(verifyOutput.trim() || "{}");

  stdout.write(
    JSON.stringify(
      {
        dry_run: false,
        run_label: String(args["run-label"] ?? env.OPS_RUN_LABEL ?? "manual"),
        deployment: String(args.deployment ?? env.OPS_DEPLOYMENT ?? "unknown"),
        status: exitCode === 0 ? "ok" : "failed",
        verify,
        publish_artifacts: null,
        notify: null
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
  runScheduledGatewayVerify().then(
    (code) => {
      process.exit(code);
    },
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  );
}
