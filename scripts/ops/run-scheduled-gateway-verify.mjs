#!/usr/bin/env node
import { publishOpsArtifacts } from "./lib/publish-artifacts.mjs";
import { sendOpsAlert } from "./lib/send-ops-alert.mjs";
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

const resolveRunLabel = (env, args) =>
  String(args["run-label"] ?? env.OPS_RUN_LABEL ?? "manual");

const resolveDeployment = (env, args) =>
  String(args.deployment ?? env.OPS_DEPLOYMENT ?? "unknown");

const buildPlan = (env, args) => ({
  dry_run: true,
  run_label: resolveRunLabel(env, args),
  deployment: resolveDeployment(env, args),
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

const buildNotifyPayload = ({
  runLabel,
  deployment,
  status,
  verify,
  publishedArtifacts
}) => ({
  run_label: runLabel,
  deployment,
  status,
  failure_reasons: Array.isArray(verify.failure_reasons)
    ? verify.failure_reasons
    : [],
  ...(publishedArtifacts ? { published_artifacts: publishedArtifacts } : {})
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

  const runLabel = resolveRunLabel(env, args);
  const deployment = resolveDeployment(env, args);
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
  const shouldPublish = env.OPS_PUBLISH_ARTIFACTS === "1" && verify.output_dir;
  const publishedArtifacts = shouldPublish
    ? await publishOpsArtifacts({
        outputDir: verify.output_dir,
        env
      })
    : null;
  const status = exitCode === 0 ? "ok" : "failed";
  const notify = await sendOpsAlert({
    webhookUrl: env.OPS_NOTIFY_WEBHOOK_URL,
    env,
    payload: buildNotifyPayload({
      runLabel,
      deployment,
      status,
      verify,
      publishedArtifacts
    })
  });

  stdout.write(
    JSON.stringify(
      {
        dry_run: false,
        run_label: runLabel,
        deployment,
        status,
        verify,
        published_artifacts: publishedArtifacts,
        notify
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
