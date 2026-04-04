#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_CASES_PATH = "benchmarks/command-quality-cases.json";
const DEFAULT_CONTROL_PLANE_URL = "http://127.0.0.1:4310";
const DEFAULT_AGENT_ID = "geometry_solver";
const DEFAULT_WORKFLOW_ID = "wf_geometry_solver";
const DOMAIN_LIST = ["2d", "3d", "cas", "probability"];
const CAPABILITY_GATES = {
  platform_runs: "control_plane_v3",
  run_snapshot_required: true
};

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const casesPath = args.cases ?? DEFAULT_CASES_PATH;
const absoluteCasesPath = path.resolve(process.cwd(), casesPath);

const payload = JSON.parse(fs.readFileSync(absoluteCasesPath, "utf8"));
if (!Array.isArray(payload.cases)) {
  throw new Error("Invalid benchmark payload: cases must be an array");
}

const cases = payload.cases.map((item, index) => {
  const domain = String(item.domain ?? "").trim();
  const prompt = String(item.prompt ?? "").trim();
  const id = String(item.id ?? `${domain || "case"}-${index + 1}`);

  if (!domain || !prompt) {
    throw new Error(`Invalid case at index ${index}: domain and prompt are required`);
  }

  return {
    id,
    domain,
    prompt
  };
});

const byDomain = countByDomain(cases);

if (args["dry-run"]) {
  writeResult(
    {
      dry_run: true,
      case_file: path.relative(process.cwd(), absoluteCasesPath),
      total_cases: cases.length,
      by_domain: byDomain,
      capability_gates: CAPABILITY_GATES
    },
    args.output
  );
  process.exit(0);
}

const controlPlaneUrl = normalizeBaseUrl(
  args["control-plane-url"] ?? process.env.CONTROL_PLANE_URL ?? DEFAULT_CONTROL_PLANE_URL
);

const startedAt = Date.now();
const results = [];

for (const testCase of cases) {
  const requestStartedAt = Date.now();

  try {
    const thread = await fetchJson(`${controlPlaneUrl}/api/v3/threads`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        title: testCase.id
      })
    });
    const threadId = String(thread?.thread?.id ?? "");
    if (!threadId) {
      throw new Error("missing_thread_id");
    }

    const run = await fetchJson(
      `${controlPlaneUrl}/api/v3/threads/${encodeURIComponent(threadId)}/runs`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          agentId: DEFAULT_AGENT_ID,
          workflowId: DEFAULT_WORKFLOW_ID,
          inputArtifactIds: []
        })
      }
    );
    const runId = String(run?.run?.id ?? "");
    if (!runId) {
      throw new Error("missing_run_id");
    }

    const streamBody = await fetchText(
      `${controlPlaneUrl}/api/v3/runs/${encodeURIComponent(runId)}/stream`
    );
    const snapshot = parseRunSnapshotStream(streamBody);
    const commandCount = getCommandCount(snapshot);
    const ok =
      snapshot?.run?.status !== "failed" &&
      Array.isArray(snapshot?.artifacts) &&
      commandCount > 0;

    results.push({
      id: testCase.id,
      domain: testCase.domain,
      latency_ms: Date.now() - requestStartedAt,
      ok,
      status: snapshot?.run?.status ?? null,
      error_code: ok ? null : "RUN_SNAPSHOT_INVALID",
      error_message: ok ? null : "Run snapshot did not expose a command batch"
    });
  } catch (error) {
    results.push({
      id: testCase.id,
      domain: testCase.domain,
      latency_ms: Date.now() - requestStartedAt,
      ok: false,
      status: null,
      error_code: "NETWORK_ERROR",
      error_message: error instanceof Error ? error.message : String(error)
    });
  }
}

const completedAt = Date.now();

const successCount = results.filter((item) => item.ok).length;
const failedResults = results.filter((item) => !item.ok);
writeResult(
  {
    dry_run: false,
    control_plane_url: controlPlaneUrl,
    case_file: path.relative(process.cwd(), absoluteCasesPath),
    total_cases: results.length,
    success_cases: successCount,
    failed_cases: failedResults.length,
    success_rate: toFixedNumber(successCount / Math.max(results.length, 1)),
    elapsed_ms: completedAt - startedAt,
    by_domain: buildDomainSummary(results),
    failures: failedResults,
    capability_gates: CAPABILITY_GATES
  },
  args.output
);

if (failedResults.length > 0) {
  process.exitCode = 1;
}

function parseArgs(argv) {
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

function printHelp() {
  console.log(
    [
      "Usage: node scripts/bench/run-quality-benchmark.mjs [options]",
      "",
      "Options:",
      "  --dry-run                   Validate case file and print counts only",
      "  --cases <path>              Benchmark case file (default: benchmarks/command-quality-cases.json)",
      "  --control-plane-url <url>   Control plane base URL",
      "  --output <path>             Write JSON result to a file",
      "  --help                      Show this help"
    ].join("\n")
  );
}

function normalizeBaseUrl(value) {
  return String(value ?? "").replace(/\/+$/, "");
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `request_failed:${response.status}:${JSON.stringify(body ?? null)}`
    );
  }

  return body;
}

async function fetchText(url, options) {
  const response = await fetch(url, options);
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`request_failed:${response.status}:${body}`);
  }

  return body;
}

function parseRunSnapshotStream(payload) {
  const dataLine = payload
    .split("\n")
    .find((line) => line.startsWith("data: "));

  if (!dataLine) {
    throw new Error("missing_run_snapshot");
  }

  return JSON.parse(dataLine.slice(6));
}

function getCommandCount(snapshot) {
  const latestToolResult = [...(snapshot?.artifacts ?? [])]
    .filter((artifact) => artifact?.kind === "tool_result")
    .sort((left, right) => String(left?.createdAt).localeCompare(String(right?.createdAt)))
    .at(-1);

  if (typeof latestToolResult?.metadata?.commandCount === "number") {
    return latestToolResult.metadata.commandCount;
  }

  const commands = latestToolResult?.inlineData?.commandBatch?.commands;
  return Array.isArray(commands) ? commands.length : 0;
}

function countByDomain(items) {
  const initial = Object.fromEntries(DOMAIN_LIST.map((domain) => [domain, 0]));
  return items.reduce((acc, item) => {
    acc[item.domain] = (acc[item.domain] ?? 0) + 1;
    return acc;
  }, initial);
}

function buildDomainSummary(results) {
  const grouped = {};

  for (const item of results) {
    if (!grouped[item.domain]) {
      grouped[item.domain] = [];
    }
    grouped[item.domain].push(item);
  }

  const summary = {};
  for (const domain of DOMAIN_LIST) {
    const domainResults = grouped[domain] ?? [];
    const success = domainResults.filter((item) => item.ok).length;
    const latency = domainResults.map((item) => item.latency_ms);

    summary[domain] = {
      total: domainResults.length,
      success,
      failed: domainResults.length - success,
      success_rate: toFixedNumber(success / Math.max(domainResults.length, 1)),
      avg_latency_ms: toFixedNumber(average(latency)),
      p95_latency_ms: toFixedNumber(percentile(latency, 0.95))
    };
  }

  for (const domain of Object.keys(grouped)) {
    if (summary[domain]) {
      continue;
    }

    const domainResults = grouped[domain];
    const success = domainResults.filter((item) => item.ok).length;
    const latency = domainResults.map((item) => item.latency_ms);
    summary[domain] = {
      total: domainResults.length,
      success,
      failed: domainResults.length - success,
      success_rate: toFixedNumber(success / Math.max(domainResults.length, 1)),
      avg_latency_ms: toFixedNumber(average(latency)),
      p95_latency_ms: toFixedNumber(percentile(latency, 0.95))
    };
  }

  return summary;
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, ratio) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1)
  );
  return sorted[index] ?? 0;
}

function toFixedNumber(value) {
  return Number((value || 0).toFixed(4));
}

function writeResult(payload, outputPath) {
  const json = JSON.stringify(payload, null, 2);
  if (outputPath) {
    fs.writeFileSync(path.resolve(process.cwd(), outputPath), `${json}\n`, "utf8");
    return;
  }

  process.stdout.write(`${json}\n`);
}
