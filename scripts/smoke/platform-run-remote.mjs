#!/usr/bin/env node

const DEFAULT_THREAD_TITLE = "Remote platform run smoke";
const DEFAULT_PROFILE_ID = "platform_geometry_standard";

export function buildPlatformRunRemoteChecks() {
  return [
    {
      name: "POST /api/v1/auth/token/login",
      method: "POST",
      path: "/api/v1/auth/token/login"
    },
    {
      name: "POST /api/v3/threads",
      method: "POST",
      path: "/api/v3/threads"
    },
    {
      name: "POST /api/v3/threads/:threadId/runs",
      method: "POST",
      path: "/api/v3/threads/:threadId/runs"
    },
    {
      name: "GET /api/v3/runs/:runId/stream",
      method: "GET",
      path: "/api/v3/runs/:runId/stream"
    }
  ];
}

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

const parseJsonText = (text) => {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const fetchJson = async (fetchImpl, url, options, label) => {
  const response = await fetchImpl(url, options);
  const body = parseJsonText(await response.text());

  if (!response.ok) {
    throw new Error(
      `${label} failed: ${response.status} ${JSON.stringify(body ?? null)}`
    );
  }

  return body;
};

const fetchText = async (fetchImpl, url, options, label) => {
  const response = await fetchImpl(url, options);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${text}`);
  }

  return text;
};

const parseRunSnapshotStream = (payload) => {
  const dataLine = payload
    .split("\n")
    .find((line) => line.startsWith("data: "));

  if (!dataLine) {
    throw new Error("run stream failed: missing snapshot payload");
  }

  return JSON.parse(dataLine.slice(6));
};

const validateRunSnapshot = (snapshot) => {
  if (!snapshot?.run?.id) {
    throw new Error("run stream failed: missing run id");
  }
  if (!Array.isArray(snapshot.events)) {
    throw new Error("run stream failed: missing events");
  }
  if (!Array.isArray(snapshot.artifacts)) {
    throw new Error("run stream failed: missing artifacts");
  }

  return {
    runId: snapshot.run.id,
    finalStatus: snapshot.run.status ?? null,
    artifactCount: snapshot.artifacts.length,
    eventCount: snapshot.events.length
  };
};

const runLiveChecks = async ({
  gatewayUrl,
  controlPlaneUrl,
  env,
  fetchImpl
}) => {
  const checks = [];

  const loginBody = await fetchJson(
    fetchImpl,
    `${gatewayUrl}/api/v1/auth/token/login`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        token: env.PRESET_TOKEN,
        device_id: "platform-run-remote-smoke"
      })
    },
    "auth login"
  );
  if (!loginBody?.session_token) {
    throw new Error("auth login failed: missing session_token");
  }
  checks.push({
    name: "POST /api/v1/auth/token/login",
    ok: true
  });

  const threadBody = await fetchJson(
    fetchImpl,
    `${controlPlaneUrl}/api/v3/threads`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        title: env.SMOKE_THREAD_TITLE ?? DEFAULT_THREAD_TITLE
      })
    },
    "create thread"
  );
  if (!threadBody?.thread?.id) {
    throw new Error("create thread failed: missing thread id");
  }
  checks.push({
    name: "POST /api/v3/threads",
    ok: true,
    thread_id: threadBody.thread.id
  });

  const runBody = await fetchJson(
    fetchImpl,
    `${controlPlaneUrl}/api/v3/threads/${encodeURIComponent(threadBody.thread.id)}/runs`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${loginBody.session_token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        profileId: env.SMOKE_PROFILE_ID ?? DEFAULT_PROFILE_ID,
        inputArtifactIds: []
      })
    },
    "start run"
  );
  if (!runBody?.run?.id) {
    throw new Error("start run failed: missing run id");
  }
  checks.push({
    name: "POST /api/v3/threads/:threadId/runs",
    ok: true,
    run_id: runBody.run.id,
    run_status: runBody.run.status ?? null
  });

  const streamBody = await fetchText(
    fetchImpl,
    `${controlPlaneUrl}/api/v3/runs/${encodeURIComponent(runBody.run.id)}/stream`,
    undefined,
    "stream run"
  );
  const snapshot = parseRunSnapshotStream(streamBody);
  const summary = validateRunSnapshot(snapshot);
  checks.push({
    name: "GET /api/v3/runs/:runId/stream",
    ok: true,
    run_id: summary.runId,
    final_status: summary.finalStatus,
    artifact_count: summary.artifactCount,
    event_count: summary.eventCount
  });

  return checks;
};

const printHelp = (stdout) => {
  stdout.write(
    [
      "Usage: node scripts/smoke/platform-run-remote.mjs [options]",
      "",
      "Options:",
      "  --dry-run                 Print ordered checks without network calls",
      "  --gateway-url <url>       Gateway base URL (or GATEWAY_URL)",
      "  --control-plane-url <url> Control plane base URL (or CONTROL_PLANE_URL)",
      "  --help                    Show this help"
    ].join("\n") + "\n"
  );
};

export async function runPlatformRunRemoteSmoke({
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
  const checks = buildPlatformRunRemoteChecks();

  if (args["dry-run"]) {
    stdout.write(
      JSON.stringify(
        {
          dry_run: true,
          gateway_url: gatewayUrl,
          control_plane_url: controlPlaneUrl,
          checks
        },
        null,
        2
      ) + "\n"
    );
    return 0;
  }

  if (!gatewayUrl) {
    throw new Error(
      "GATEWAY_URL or --gateway-url is required for remote platform smoke"
    );
  }
  if (!controlPlaneUrl) {
    throw new Error(
      "CONTROL_PLANE_URL or --control-plane-url is required for remote platform smoke"
    );
  }
  if (!env.PRESET_TOKEN) {
    throw new Error("PRESET_TOKEN is required for remote platform smoke");
  }

  const results = await runLiveChecks({
    gatewayUrl,
    controlPlaneUrl,
    env,
    fetchImpl
  });

  stdout.write(
    JSON.stringify(
      {
        dry_run: false,
        gateway_url: gatewayUrl,
        control_plane_url: controlPlaneUrl,
        checks: results
      },
      null,
      2
    ) + "\n"
  );
  return 0;
}

const isMainModule = (() => {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  return import.meta.url === new URL(`file://${entry}`).href;
})();

if (isMainModule) {
  runPlatformRunRemoteSmoke().then(
    (code) => {
      process.exit(code);
    },
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  );
}
