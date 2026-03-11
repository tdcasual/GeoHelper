#!/usr/bin/env node

const DEFAULT_COMPILE_MESSAGE = "创建点A=(0,0)，画一个半径为3的圆";

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
    name: "POST /api/v1/chat/compile",
    method: "POST",
    path: "/api/v1/chat/compile"
  });

  if (env.ADMIN_METRICS_TOKEN) {
    checks.push({
      name: "GET /admin/metrics",
      method: "GET",
      path: "/admin/metrics"
    });
  }

  return checks;
}

const normalizeBaseUrl = (value) => String(value ?? "").replace(/\/$/, "");

const parseJsonResponse = async (response) => {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const assertResponseOk = async (response, label) => {
  if (response.ok) {
    return;
  }

  const body = await parseJsonResponse(response);
  throw new Error(
    `${label} failed: ${response.status} ${JSON.stringify(body ?? null)}`
  );
};

const runLiveChecks = async ({ gatewayUrl, env, fetchImpl }) => {
  const checks = [];

  const healthResponse = await fetchImpl(`${gatewayUrl}/api/v1/health`);
  await assertResponseOk(healthResponse, "health");
  const healthBody = await parseJsonResponse(healthResponse);
  if (healthBody?.status !== "ok") {
    throw new Error("health failed: unexpected payload");
  }
  checks.push({
    name: "GET /api/v1/health",
    ok: true
  });

  const readyResponse = await fetchImpl(`${gatewayUrl}/api/v1/ready`);
  await assertResponseOk(readyResponse, "ready");
  const readyBody = await parseJsonResponse(readyResponse);
  if (!readyBody?.ready) {
    throw new Error("ready failed: gateway is not ready");
  }
  checks.push({
    name: "GET /api/v1/ready",
    ok: true
  });

  let revokedToken;
  if (env.PRESET_TOKEN) {
    const loginResponse = await fetchImpl(`${gatewayUrl}/api/v1/auth/token/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        token: env.PRESET_TOKEN,
        device_id: "gateway-runtime-smoke"
      })
    });
    await assertResponseOk(loginResponse, "auth login");
    const loginBody = await parseJsonResponse(loginResponse);
    if (!loginBody?.session_token) {
      throw new Error("auth login failed: missing session_token");
    }
    revokedToken = String(loginBody.session_token);
    checks.push({
      name: "POST /api/v1/auth/token/login",
      ok: true
    });

    const revokeResponse = await fetchImpl(`${gatewayUrl}/api/v1/auth/token/revoke`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${revokedToken}`
      }
    });
    await assertResponseOk(revokeResponse, "auth revoke");
    const revokeBody = await parseJsonResponse(revokeResponse);
    if (!revokeBody?.revoked) {
      throw new Error("auth revoke failed: missing revoked=true");
    }
    checks.push({
      name: "POST /api/v1/auth/token/revoke",
      ok: true
    });
  }

  const compileResponse = await fetchImpl(`${gatewayUrl}/api/v1/chat/compile`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      message: env.SMOKE_COMPILE_MESSAGE ?? DEFAULT_COMPILE_MESSAGE,
      mode: "byok",
      ...(env.LITELLM_MODEL ? { model: env.LITELLM_MODEL } : {})
    })
  });
  await assertResponseOk(compileResponse, "compile");
  const compileBody = await parseJsonResponse(compileResponse);
  if (!Array.isArray(compileBody?.batch?.commands) || !compileBody?.trace_id) {
    throw new Error("compile failed: missing batch.commands or trace_id");
  }
  if (compileResponse.headers.get("x-trace-id") !== compileBody.trace_id) {
    throw new Error("compile failed: trace header mismatch");
  }
  checks.push({
    name: "POST /api/v1/chat/compile",
    ok: true,
    trace_id: compileBody.trace_id
  });

  if (env.ADMIN_METRICS_TOKEN) {
    const metricsResponse = await fetchImpl(`${gatewayUrl}/admin/metrics`, {
      headers: {
        "x-admin-token": env.ADMIN_METRICS_TOKEN
      }
    });
    await assertResponseOk(metricsResponse, "admin metrics");
    const metricsBody = await parseJsonResponse(metricsResponse);
    if (typeof metricsBody?.compile?.total_requests !== "number") {
      throw new Error("admin metrics failed: missing compile totals");
    }
    checks.push({
      name: "GET /admin/metrics",
      ok: true,
      total_requests: metricsBody.compile.total_requests
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
    path: check.path
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
