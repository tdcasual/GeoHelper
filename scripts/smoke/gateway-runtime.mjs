#!/usr/bin/env node

const DEFAULT_COMPILE_MESSAGE = "创建点A=(0,0)，画一个半径为3的圆";
const DEFAULT_ATTACHMENT_COMPILE_MESSAGE = "根据图片给出几何作图步骤";
const DEFAULT_ATTACHMENT_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=";
const ATTACHMENT_CHECK_NAME = "POST /api/v2/agent/runs (attachment)";

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

const parseJsonEnv = (value) => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const resolveAttachmentCapability = (runtimeIdentity, env = process.env) =>
  Boolean(runtimeIdentity?.attachments_enabled) || env.SMOKE_FORCE_ATTACHMENT_CHECK === "1";

const buildAttachmentCheck = () => ({
  name: ATTACHMENT_CHECK_NAME,
  method: "POST",
  path: "/api/v2/agent/runs",
  capability: "attachments"
});

export function buildGatewayRuntimeChecks(
  env = process.env,
  runtimeIdentity = parseJsonEnv(env.SMOKE_GATEWAY_IDENTITY_JSON)
) {
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
    name: "POST /api/v2/agent/runs",
    method: "POST",
    path: "/api/v2/agent/runs"
  });

  if (resolveAttachmentCapability(runtimeIdentity, env)) {
    checks.push(buildAttachmentCheck());
  }

  if (env.ADMIN_METRICS_TOKEN) {
    checks.push({
      name: "GET /admin/compile-events",
      method: "GET",
      path: "/admin/compile-events?limit=10"
    });
    checks.push({
      name: "GET /admin/metrics",
      method: "GET",
      path: "/admin/metrics"
    });
  }

  return checks;
}

const normalizeBaseUrl = (value) => String(value ?? "").replace(/\/$/, "");

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

  return { response, body };
};

const getAdminHeaders = (env) => ({
  "x-admin-token": env.ADMIN_METRICS_TOKEN
});

const buildAttachmentCompileRequestBody = (env) => ({
  message: env.SMOKE_ATTACHMENT_COMPILE_MESSAGE ?? DEFAULT_ATTACHMENT_COMPILE_MESSAGE,
  mode: "byok",
  ...(env.LITELLM_MODEL ? { model: env.LITELLM_MODEL } : {}),
  attachments: [
    {
      id: "smoke_img_1",
      kind: "image",
      name: "gateway-smoke.png",
      mimeType: "image/png",
      size: 68,
      transportPayload: env.SMOKE_ATTACHMENT_DATA_URL ?? DEFAULT_ATTACHMENT_DATA_URL
    }
  ]
});

const validateAgentRunResponse = (label, response, body) => {
  const traceId = body?.trace_id;
  const agentRun = body?.agent_run;
  if (typeof traceId !== "string" || !agentRun) {
    throw new Error(`${label} failed: missing trace_id or agent_run`);
  }
  const runId = agentRun.run?.id;
  if (!runId) {
    throw new Error(`${label} failed: missing agent_run.run.id`);
  }
  const commandBatch = agentRun.draft?.commandBatchDraft;
  if (!commandBatch || !Array.isArray(commandBatch.commands)) {
    throw new Error(
      `${label} failed: missing agent_run.draft.commandBatchDraft.commands`
    );
  }
  const stages = agentRun.telemetry?.stages;
  if (!Array.isArray(stages) || stages.length === 0) {
    throw new Error(`${label} failed: missing agent_run.telemetry.stages`);
  }
  if (response.headers.get("x-trace-id") !== traceId) {
    throw new Error(`${label} failed: trace header mismatch`);
  }
  return {
    traceId,
    runId,
    commandCount: commandBatch.commands.length,
    telemetryStages: stages.length
  };
};

const runLiveChecks = async ({ gatewayUrl, env, fetchImpl }) => {
  const checks = [];
  let runtimeIdentity = parseJsonEnv(env.SMOKE_GATEWAY_IDENTITY_JSON);

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

  let metricsBefore = null;
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
    runtimeIdentity = versionBody;
    checks.push({
      name: "GET /admin/version",
      ok: true,
      git_sha: versionBody.git_sha ?? null,
      build_time: versionBody.build_time ?? null,
      redis_enabled: versionBody.redis_enabled,
      attachments_enabled: Boolean(versionBody.attachments_enabled)
    });

    const { body: metricsBody } = await fetchJson(
      fetchImpl,
      `${gatewayUrl}/admin/metrics`,
      {
        headers: getAdminHeaders(env)
      },
      "admin metrics baseline"
    );
    if (typeof metricsBody?.compile?.total_requests !== "number") {
      throw new Error("admin metrics baseline failed: missing compile totals");
    }
    metricsBefore = metricsBody.compile.total_requests;
  }

  let revokedToken;
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
    revokedToken = String(loginBody.session_token);
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
          authorization: `Bearer ${revokedToken}`
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

  const { response: compileResponse, body: compileBody } = await fetchJson(
    fetchImpl,
    `${gatewayUrl}/api/v2/agent/runs`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        message: env.SMOKE_COMPILE_MESSAGE ?? DEFAULT_COMPILE_MESSAGE,
        mode: "byok",
        ...(env.LITELLM_MODEL ? { model: env.LITELLM_MODEL } : {})
      })
    },
    "compile"
  );
  const compileResult = validateAgentRunResponse("compile", compileResponse, compileBody);
  checks.push({
    name: "POST /api/v2/agent/runs",
    ok: true,
    trace_id: compileResult.traceId,
    run_id: compileResult.runId,
    command_count: compileResult.commandCount,
    telemetry_stages: compileResult.telemetryStages
  });

  const attachmentSmokeEnabled = resolveAttachmentCapability(runtimeIdentity, env);
  if (attachmentSmokeEnabled) {
    const attachmentRequestBody = buildAttachmentCompileRequestBody(env);
    const {
      response: attachmentCompileResponse,
      body: attachmentCompileBody
    } = await fetchJson(
      fetchImpl,
      `${gatewayUrl}/api/v2/agent/runs`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(attachmentRequestBody)
      },
      "attachment compile"
    );
    const attachmentResult = validateAgentRunResponse(
      "attachment compile",
      attachmentCompileResponse,
      attachmentCompileBody
    );
    checks.push({
      name: ATTACHMENT_CHECK_NAME,
      ok: true,
      trace_id: attachmentResult.traceId,
      run_id: attachmentResult.runId,
      command_count: attachmentResult.commandCount,
      telemetry_stages: attachmentResult.telemetryStages,
      attachments_count: Array.isArray(attachmentRequestBody.attachments)
        ? attachmentRequestBody.attachments.length
        : 0
    });
  }

  if (env.ADMIN_METRICS_TOKEN) {
    const traceId = String(compileBody.trace_id);
    const { body: compileEventsBody } = await fetchJson(
      fetchImpl,
      `${gatewayUrl}/admin/compile-events?traceId=${encodeURIComponent(traceId)}&limit=10`,
      {
        headers: getAdminHeaders(env)
      },
      "admin compile events"
    );
    if (!Array.isArray(compileEventsBody?.events)) {
      throw new Error("admin compile events failed: missing events array");
    }
    const matchingEvent = compileEventsBody.events.find(
      (event) => event?.traceId === traceId
    );
    if (!matchingEvent) {
      throw new Error("admin compile events failed: trace not found");
    }
    checks.push({
      name: "GET /admin/compile-events",
      ok: true,
      trace_id: traceId,
      final_status: matchingEvent.finalStatus ?? null,
      event_count: compileEventsBody.events.length
    });

    const { body: metricsBody } = await fetchJson(
      fetchImpl,
      `${gatewayUrl}/admin/metrics`,
      {
        headers: getAdminHeaders(env)
      },
      "admin metrics"
    );
    if (typeof metricsBody?.compile?.total_requests !== "number") {
      throw new Error("admin metrics failed: missing compile totals");
    }
    const expectedAdvance = attachmentSmokeEnabled ? 2 : 1;
    if (
      typeof metricsBefore === "number" &&
      metricsBody.compile.total_requests < metricsBefore + expectedAdvance
    ) {
      throw new Error("admin metrics failed: compile totals did not advance");
    }
    checks.push({
      name: "GET /admin/metrics",
      ok: true,
      total_requests_before: metricsBefore,
      total_requests_after: metricsBody.compile.total_requests,
      total_requests_expected_min:
        typeof metricsBefore === "number" ? metricsBefore + expectedAdvance : null
    });
  }

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
    stdout.write([
      "Usage: node scripts/smoke/gateway-runtime.mjs [options]",
      "",
      "Options:",
      "  --dry-run                 Print ordered checks without network calls",
      "  --gateway-url <url>       Gateway base URL (or GATEWAY_URL)",
      "  --help                    Show this help"
    ].join("\n") + "\n");
    return 0;
  }

  const checks = buildGatewayRuntimeChecks(env).map((check) => ({
    name: check.name,
    method: check.method,
    path: check.path,
    ...(check.capability ? { capability: check.capability } : {})
  }));

  const gatewayUrl = normalizeBaseUrl(args["gateway-url"] ?? env.GATEWAY_URL);

  if (args["dry-run"]) {
    stdout.write(
      JSON.stringify(
        {
          dry_run: true,
          gateway_url: gatewayUrl || null,
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

  const results = await runLiveChecks({ gatewayUrl, env, fetchImpl });
  stdout.write(
    JSON.stringify(
      {
        dry_run: false,
        gateway_url: gatewayUrl,
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
      process.exit(code);
    },
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  );
}
