#!/usr/bin/env node

const DEFAULT_THREAD_TITLE = "Gateway runtime smoke";
const DEFAULT_PROFILE_ID = "platform_geometry_standard";

export function parseArgs(argv) {
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
}

export function buildGatewayRuntimeChecks(env = process.env) {
  const checks = [
    {
      name: "GET /api/v1/health",
      method: "GET",
      path: "/api/v1/health"
    },
    {
      name: "GET /api/v1/ready",
      method: "GET",
      path: "/api/v1/ready"
    }
  ];

  if (env.ADMIN_METRICS_TOKEN) {
    checks.push({
      name: "GET /admin/version",
      method: "GET",
      path: "/admin/version"
    });
  }

  if (env.PRESET_TOKEN) {
    checks.push({
      name: "POST /api/v1/auth/token/login",
      method: "POST",
      path: "/api/v1/auth/token/login"
    });
    checks.push({
      name: "POST /api/v1/auth/token/revoke",
      method: "POST",
      path: "/api/v1/auth/token/revoke"
    });
  }

  checks.push({
    name: "POST /api/v3/threads",
    method: "POST",
    path: "/api/v3/threads"
  });
  checks.push({
    name: "POST /api/v3/threads/:threadId/runs",
    method: "POST",
    path: "/api/v3/threads/:threadId/runs"
  });
  checks.push({
    name: "GET /api/v3/runs/:runId/stream",
    method: "GET",
    path: "/api/v3/runs/:runId/stream"
  });

  return checks;
}

const normalizeBaseUrl = (value) => String(value ?? "").replace(/\/+$/, "");

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

  return {
    response,
    body
  };
};

const fetchText = async (fetchImpl, url, options, label) => {
  const response = await fetchImpl(url, options);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${text}`);
  }

  return {
    response,
    text
  };
};

const getAdminHeaders = (env) => ({
  "x-admin-token": env.ADMIN_METRICS_TOKEN
});

const parseRunSnapshotStream = (payload) => {
  const dataLine = payload
    .split("\n")
    .find((line) => line.startsWith("data: "));

  if (!dataLine) {
    throw new Error("run stream failed: missing snapshot payload");
  }

  return JSON.parse(dataLine.slice(6));
};

const getCommandCount = (snapshot) => {
  const latestToolResult = [...(snapshot?.artifacts ?? [])]
    .filter((artifact) => artifact?.kind === "tool_result")
    .sort((left, right) => String(left?.createdAt).localeCompare(String(right?.createdAt)))
    .at(-1);

  if (typeof latestToolResult?.metadata?.commandCount === "number") {
    return latestToolResult.metadata.commandCount;
  }

  const commands = latestToolResult?.inlineData?.commandBatch?.commands;
  return Array.isArray(commands) ? commands.length : 0;
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
    commandCount: getCommandCount(snapshot),
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

  const { body: healthBody } = await fetchJson(
    fetchImpl,
    `${gatewayUrl}/api/v1/health`,
    undefined,
    "health"
  );
  if (healthBody?.status !== "ok") {
    throw new Error("health failed: unexpected payload");
  }
  checks.push({
    name: "GET /api/v1/health",
    ok: true
  });

  const { body: readyBody } = await fetchJson(
    fetchImpl,
    `${gatewayUrl}/api/v1/ready`,
    undefined,
    "ready"
  );
  if (!readyBody?.ready) {
    throw new Error("ready failed: gateway is not ready");
  }
  checks.push({
    name: "GET /api/v1/ready",
    ok: true
  });

  if (env.ADMIN_METRICS_TOKEN) {
    const { body: versionBody } = await fetchJson(
      fetchImpl,
      `${gatewayUrl}/admin/version`,
      {
        headers: getAdminHeaders(env)
      },
      "admin version"
    );
    if (
      typeof versionBody?.node_env !== "string" ||
      typeof versionBody?.redis_enabled !== "boolean"
    ) {
      throw new Error("admin version failed: missing runtime identity fields");
    }
    checks.push({
      name: "GET /admin/version",
      ok: true,
      git_sha: versionBody.git_sha ?? null,
      build_time: versionBody.build_time ?? null,
      redis_enabled: versionBody.redis_enabled,
      attachments_enabled: Boolean(versionBody.attachments_enabled)
    });
  }

  if (env.PRESET_TOKEN) {
    const { body: loginBody } = await fetchJson(
      fetchImpl,
      `${gatewayUrl}/api/v1/auth/token/login`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          token: env.PRESET_TOKEN,
          device_id: "gateway-runtime-smoke"
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

    const { body: revokeBody } = await fetchJson(
      fetchImpl,
      `${gatewayUrl}/api/v1/auth/token/revoke`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${loginBody.session_token}`
        }
      },
      "auth revoke"
    );
    if (!revokeBody?.revoked) {
      throw new Error("auth revoke failed: missing revoked=true");
    }
    checks.push({
      name: "POST /api/v1/auth/token/revoke",
      ok: true
    });
  }

  const { body: threadBody } = await fetchJson(
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

  const { body: runBody } = await fetchJson(
    fetchImpl,
    `${controlPlaneUrl}/api/v3/threads/${encodeURIComponent(threadBody.thread.id)}/runs`,
    {
      method: "POST",
      headers: {
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

  const { text: streamBody } = await fetchText(
    fetchImpl,
    `${controlPlaneUrl}/api/v3/runs/${encodeURIComponent(runBody.run.id)}/stream`,
    undefined,
    "stream run"
  );
  const snapshot = parseRunSnapshotStream(streamBody);
  const snapshotSummary = validateRunSnapshot(snapshot);
  checks.push({
    name: "GET /api/v3/runs/:runId/stream",
    ok: true,
    run_id: snapshotSummary.runId,
    final_status: snapshotSummary.finalStatus,
    command_count: snapshotSummary.commandCount,
    artifact_count: snapshotSummary.artifactCount,
    event_count: snapshotSummary.eventCount
  });

  return checks;
};

export async function runGatewayRuntimeSmoke({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = globalThis.fetch,
  stdout = process.stdout
} = {}) {
  const args = parseArgs(argv);

  if (args.help) {
    stdout.write(
      [
        "Usage: node scripts/smoke/gateway-runtime.mjs [options]",
        "",
        "Options:",
        "  --dry-run                 Print ordered checks without network calls",
        "  --gateway-url <url>       Gateway base URL (or GATEWAY_URL)",
        "  --control-plane-url <url> Control plane base URL (defaults to gateway URL)",
        "  --help                    Show this help"
      ].join("\n") + "\n"
    );
    return 0;
  }

  const gatewayUrl = normalizeBaseUrl(args["gateway-url"] ?? env.GATEWAY_URL);
  const controlPlaneUrl = normalizeBaseUrl(
    args["control-plane-url"] ?? env.CONTROL_PLANE_URL ?? gatewayUrl
  );
  const checks = buildGatewayRuntimeChecks(env).map((check) => ({
    name: check.name,
    method: check.method,
    path: check.path
  }));

  if (args["dry-run"]) {
    stdout.write(
      JSON.stringify(
        {
          dry_run: true,
          gateway_url: gatewayUrl || null,
          control_plane_url: controlPlaneUrl || null,
          checks
        },
        null,
        2
      ) + "\n"
    );
    return 0;
  }

  if (!gatewayUrl) {
    throw new Error("GATEWAY_URL or --gateway-url is required for live smoke");
  }
  if (!controlPlaneUrl) {
    throw new Error(
      "CONTROL_PLANE_URL or --control-plane-url is required for live smoke"
    );
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
  runGatewayRuntimeSmoke().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  );
}
