#!/usr/bin/env node
import path from "node:path";

import { runGatewayBackupRestore } from "../smoke/gateway-backup-restore.mjs";
import { runGatewayRuntimeSmoke } from "../smoke/gateway-runtime.mjs";
import { runPlatformRunRemoteSmoke } from "../smoke/platform-run-remote.mjs";
import { resolveOpsArtifactDir, writeJsonArtifact } from "./lib/artifact-paths.mjs";
import { runScheduledGatewayVerify } from "./run-scheduled-gateway-verify.mjs";

const DEFAULT_BUNDLE_ID = "geometry_reviewer";

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

const normalizeBaseUrl = (value) => {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.replace(/\/+$/, "") : null;
};

const parseJsonMaybe = (value) => {
  if (!value) {
    return null;
  }

  return JSON.parse(String(value));
};

const createBufferedStdout = () => {
  let output = "";
  return {
    stdout: {
      write(chunk) {
        output += String(chunk);
        return true;
      }
    },
    read: () => output
  };
};

const printHelp = (stdout) => {
  stdout.write(
    [
      "Usage: node scripts/ops/run-release-candidate-live-checks.mjs [options]",
      "",
      "Options:",
      "  --dry-run                 Print the planned release-candidate phases",
      "  --gateway-url <url>       Gateway base URL (or GATEWAY_URL)",
      "  --control-plane-url <url> Control plane base URL (or CONTROL_PLANE_URL)",
      "  --bundle-id <id>          Portable bundle to rehearse (or RELEASE_BUNDLE_ID)",
      "  --help                    Show this help"
    ].join("\n") + "\n"
  );
};

const captureRunnerResult = async ({
  runner,
  env,
  fetchImpl
}) => {
  const buffer = createBufferedStdout();
  const exitCode = await runner({
    env,
    fetchImpl,
    stdout: buffer.stdout
  });

  const text = buffer.read().trim();

  return {
    exitCode,
    result: text ? JSON.parse(text) : null
  };
};

const resolveStepStatus = ({ exitCode, result, error }) => {
  if (error) {
    return "failed";
  }
  if (exitCode !== 0) {
    return "failed";
  }
  if (result?.status === "failed") {
    return "failed";
  }

  return "ok";
};

const resolveStepResult = async ({
  env,
  mockEnvKey,
  runner,
  fetchImpl
}) => {
  try {
    const mocked = parseJsonMaybe(env[mockEnvKey]);
    if (mocked) {
      return {
        status: resolveStepStatus({
          exitCode: mocked?.status === "failed" ? 1 : 0,
          result: mocked
        }),
        exit_code: mocked?.status === "failed" ? 1 : 0,
        result: mocked
      };
    }

    const { exitCode, result } = await captureRunnerResult({
      runner,
      env,
      fetchImpl
    });

    return {
      status: resolveStepStatus({
        exitCode,
        result
      }),
      exit_code: exitCode,
      result
    };
  } catch (error) {
    return {
      status: "failed",
      exit_code: 1,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

const runBundleAudit = async ({
  env,
  fetchImpl,
  controlPlaneUrl,
  bundleId,
  outputDir
}) => {
  const mocked = parseJsonMaybe(env.RELEASE_CANDIDATE_MOCK_BUNDLE_AUDIT_JSON);
  if (mocked) {
    return {
      status: resolveStepStatus({
        exitCode: mocked?.status === "failed" ? 1 : 0,
        result: mocked
      }),
      exit_code: mocked?.status === "failed" ? 1 : 0,
      result: mocked
    };
  }

  if (!controlPlaneUrl) {
    throw new Error(
      "CONTROL_PLANE_URL or --control-plane-url is required for bundle audit"
    );
  }

  const response = await fetchImpl(
    `${controlPlaneUrl}/admin/bundles/${encodeURIComponent(bundleId)}/export-openclaw`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        outputDir: path.join(outputDir, "openclaw", bundleId),
        verifyImport: true
      })
    }
  );
  const payload = JSON.parse(await response.text());

  if (!response.ok) {
    throw new Error(
      `bundle audit failed: ${response.status} ${JSON.stringify(payload)}`
    );
  }

  return {
    status: "ok",
    exit_code: 0,
    result: payload
  };
};

export async function runReleaseCandidateLiveChecks({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = globalThis.fetch,
  stdout = process.stdout
} = {}) {
  const args = parseArgs(argv);

  if (args.help) {
    printHelp(stdout);
    return 0;
  }

  const gatewayUrl = normalizeBaseUrl(args["gateway-url"] ?? env.GATEWAY_URL);
  const controlPlaneUrl = normalizeBaseUrl(
    args["control-plane-url"] ?? env.CONTROL_PLANE_URL
  );
  const bundleId = String(
    args["bundle-id"] ?? env.RELEASE_BUNDLE_ID ?? DEFAULT_BUNDLE_ID
  );

  if (args["dry-run"]) {
    stdout.write(
      JSON.stringify(
        {
          dry_run: true,
          gateway_url: gatewayUrl,
          control_plane_url: controlPlaneUrl,
          bundle_id: bundleId,
          phases: [
            {
              name: "gateway_runtime",
              command: "pnpm smoke:gateway-runtime"
            },
            {
              name: "backup_restore",
              command: "pnpm smoke:gateway-backup-restore"
            },
            {
              name: "platform_run",
              command: "pnpm smoke:platform-run-remote"
            },
            {
              name: "scheduled_verify",
              command: "pnpm ops:gateway:scheduled"
            },
            {
              name: "bundle_audit",
              command: `POST /admin/bundles/${bundleId}/export-openclaw`,
              verifyImport: true
            }
          ]
        },
        null,
        2
      ) + "\n"
    );
    return 0;
  }

  const resolvedEnv = {
    ...env,
    ...(gatewayUrl ? { GATEWAY_URL: gatewayUrl } : {}),
    ...(controlPlaneUrl ? { CONTROL_PLANE_URL: controlPlaneUrl } : {}),
    RELEASE_BUNDLE_ID: bundleId,
    OPS_ARTIFACT_STAMP: String(
      env.OPS_ARTIFACT_STAMP ?? new Date().toISOString()
    )
  };

  const outputDir = await resolveOpsArtifactDir(resolvedEnv);

  const gatewayRuntime = await resolveStepResult({
    env: resolvedEnv,
    mockEnvKey: "RELEASE_CANDIDATE_MOCK_GATEWAY_RUNTIME_JSON",
    runner: runGatewayRuntimeSmoke,
    fetchImpl
  });
  const backupRestore = await resolveStepResult({
    env: resolvedEnv,
    mockEnvKey: "RELEASE_CANDIDATE_MOCK_BACKUP_RESTORE_JSON",
    runner: runGatewayBackupRestore,
    fetchImpl
  });
  const platformRun = await resolveStepResult({
    env: resolvedEnv,
    mockEnvKey: "RELEASE_CANDIDATE_MOCK_PLATFORM_RUN_JSON",
    runner: runPlatformRunRemoteSmoke,
    fetchImpl
  });
  const scheduledVerify = await resolveStepResult({
    env: resolvedEnv,
    mockEnvKey: "RELEASE_CANDIDATE_MOCK_SCHEDULED_VERIFY_JSON",
    runner: runScheduledGatewayVerify,
    fetchImpl
  });

  const bundleAudit = await runBundleAudit({
    env: resolvedEnv,
    fetchImpl,
    controlPlaneUrl,
    bundleId,
    outputDir
  }).catch((error) => ({
    status: "failed",
    exit_code: 1,
    error: error instanceof Error ? error.message : String(error)
  }));

  if (bundleAudit.result) {
    await writeJsonArtifact(outputDir, "bundle-audit", bundleAudit.result);
  }

  const status = [
    gatewayRuntime,
    backupRestore,
    platformRun,
    scheduledVerify,
    bundleAudit
  ].every((step) => step.status === "ok")
    ? "ok"
    : "failed";

  const summary = {
    status,
    output_dir: outputDir,
    bundle_id: bundleId,
    gatewayRuntime,
    backupRestore,
    platformRun,
    scheduledVerify,
    bundleAudit,
    published_artifacts: scheduledVerify.result?.published_artifacts ?? null
  };
  const summaryFile = await writeJsonArtifact(
    outputDir,
    "release-candidate-summary",
    summary
  );

  stdout.write(
    JSON.stringify(
      {
        status,
        output_dir: outputDir,
        summary_artifact: summaryFile
      },
      null,
      2
    ) + "\n"
  );

  return status === "ok" ? 0 : 1;
}

const isMainModule = (() => {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  return import.meta.url === new URL(`file://${entry}`).href;
})();

if (isMainModule) {
  runReleaseCandidateLiveChecks().then(
    (code) => {
      process.exit(code);
    },
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  );
}
