#!/usr/bin/env node
import path from "node:path";

import { resolveOpsArtifactDir, writeJsonArtifact } from "./lib/artifact-paths.mjs";

const DEFAULT_LIMIT = 200;
const DEFAULT_OBSERVATION_WINDOW_DAYS = 7;

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
  return normalized ? normalized.replace(/\/$/, "") : null;
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

const parseJsonEnv = (value, label) => {
  try {
    return JSON.parse(String(value));
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
};

const toPositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const buildSteps = (limit) => [
  {
    name: "read_compile_events",
    method: "GET",
    path: `/admin/compile-events?limit=${limit}`
  },
  {
    name: "group_by_path",
    paths: ["/api/v1/chat/compile", "/api/v2/agent/runs"]
  },
  {
    name: "report_legacy_hits",
    fields: ["recordedAt", "traceId", "mode", "finalStatus", "path"]
  }
];

const printHelp = (stdout) => {
  stdout.write(
    [
      "Usage: node scripts/ops/check-legacy-compile-consumers.mjs [options]",
      "",
      "Options:",
      "  --dry-run                         Print the planned evidence collection steps",
      "  --gateway-url <url>               Gateway base URL (or GATEWAY_URL)",
      "  --limit <n>                       Number of compile events to inspect (default: 200)",
      "  --observation-window-days <days>  Reporting hint for operator sign-off (default: 7)",
      "  --help                            Show this help"
    ].join("\n") + "\n"
  );
};

const fetchJson = async (fetchImpl, url, options, label) => {
  const response = await fetchImpl(url, options);
  const body = parseJsonText(await response.text());

  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${JSON.stringify(body ?? null)}`);
  }

  return body;
};

const getAdminHeaders = (env) => ({
  "x-admin-token": env.ADMIN_METRICS_TOKEN
});

const readCompileEvents = async ({ gatewayUrl, env, fetchImpl, limit }) => {
  if (env.LEGACY_COMPILE_CHECK_MOCK_EVENTS_JSON) {
    return {
      gatewayUrl: null,
      body: parseJsonEnv(
        env.LEGACY_COMPILE_CHECK_MOCK_EVENTS_JSON,
        "LEGACY_COMPILE_CHECK_MOCK_EVENTS_JSON"
      )
    };
  }

  if (!gatewayUrl) {
    throw new Error("GATEWAY_URL or --gateway-url is required for live legacy compile check");
  }

  if (!env.ADMIN_METRICS_TOKEN) {
    throw new Error("ADMIN_METRICS_TOKEN is required for live legacy compile check");
  }

  return {
    gatewayUrl,
    body: await fetchJson(
      fetchImpl,
      `${gatewayUrl}/admin/compile-events?limit=${limit}`,
      {
        headers: getAdminHeaders(env)
      },
      "compile events"
    )
  };
};

const normalizeEvent = (event) => ({
  recordedAt: typeof event?.recordedAt === "string" ? event.recordedAt : null,
  traceId: typeof event?.traceId === "string" ? event.traceId : null,
  requestId: typeof event?.requestId === "string" ? event.requestId : null,
  finalStatus: typeof event?.finalStatus === "string" ? event.finalStatus : null,
  mode: typeof event?.mode === "string" ? event.mode : null,
  path: typeof event?.path === "string" ? event.path : null
});

const summarizeLegacyCompileEvents = (body) => {
  if (!Array.isArray(body?.events)) {
    throw new Error("compile events failed: missing events array");
  }

  const normalizedEvents = body.events.map(normalizeEvent);
  const legacyHits = normalizedEvents
    .filter((event) => event.path === "/api/v1/chat/compile")
    .sort((left, right) => {
      const leftTime = Date.parse(left.recordedAt ?? "");
      const rightTime = Date.parse(right.recordedAt ?? "");
      return rightTime - leftTime;
    });
  const agentRunHits = normalizedEvents.filter(
    (event) => event.path === "/api/v2/agent/runs"
  );

  return {
    total_events: normalizedEvents.length,
    legacy_hit_count: legacyHits.length,
    agent_run_hit_count: agentRunHits.length,
    legacy_paths_present: legacyHits.length > 0,
    legacy_hits: legacyHits
  };
};

export async function runLegacyCompileConsumerCheck({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = globalThis.fetch,
  stdout = process.stdout
} = {}) {
  const args = parseArgs(argv);
  const gatewayUrl = normalizeBaseUrl(args["gateway-url"] ?? env.GATEWAY_URL);
  const limit = toPositiveInteger(args.limit, DEFAULT_LIMIT);
  const observationWindowDays = toPositiveInteger(
    args["observation-window-days"],
    DEFAULT_OBSERVATION_WINDOW_DAYS
  );

  if (args.help) {
    printHelp(stdout);
    return 0;
  }

  if (args["dry-run"]) {
    stdout.write(
      JSON.stringify(
        {
          dry_run: true,
          gateway_url: gatewayUrl,
          observation_window_days: observationWindowDays,
          steps: buildSteps(limit)
        },
        null,
        2
      ) + "\n"
    );
    return 0;
  }

  const eventsResult = await readCompileEvents({
    gatewayUrl,
    env,
    fetchImpl,
    limit
  });
  const summary = summarizeLegacyCompileEvents(eventsResult.body);
  const outputDir = await resolveOpsArtifactDir(env);
  const artifactPayload = {
    dry_run: false,
    gateway_url: eventsResult.gatewayUrl,
    observation_window_days: observationWindowDays,
    query: {
      limit
    },
    summary: {
      total_events: summary.total_events,
      legacy_hit_count: summary.legacy_hit_count,
      agent_run_hit_count: summary.agent_run_hit_count,
      legacy_paths_present: summary.legacy_paths_present
    },
    legacy_hits: summary.legacy_hits
  };
  const artifactFile = await writeJsonArtifact(
    outputDir,
    "legacy-compile-check",
    artifactPayload
  );

  stdout.write(
    JSON.stringify(
      {
        ...artifactPayload,
        artifact: path.join(outputDir, artifactFile)
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
  runLegacyCompileConsumerCheck().then(
    (code) => {
      process.exit(code);
    },
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  );
}
