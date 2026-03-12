#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_CASES_PATH = "benchmarks/command-quality-cases.json";
const DOMAIN_LIST = ["2d", "3d", "cas", "probability"];
const CAPABILITY_GATES = {
  gateway_attachments: "explicit_flag",
  vision_smoke_required_when_enabled: true
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
  const dryRunPayload = {
    dry_run: true,
    case_file: path.relative(process.cwd(), absoluteCasesPath),
    total_cases: cases.length,
    by_domain: byDomain,
    capability_gates: CAPABILITY_GATES
  };
  writeResult(dryRunPayload, args.output);
  process.exit(0);
}

const gatewayUrl =
  args["gateway-url"] ?? process.env.GATEWAY_URL ?? "http://127.0.0.1:8787";
const endpoint = `${gatewayUrl.replace(/\/$/, "")}/api/v1/chat/compile`;
const mode = args.mode ?? process.env.BENCH_MODE ?? "byok";
const model = args.model ?? process.env.BENCH_MODEL;
const sessionToken = args["session-token"] ?? process.env.SESSION_TOKEN;

if (mode !== "byok" && mode !== "official") {
  throw new Error(`Unsupported mode: ${mode}`);
}

if (mode === "official" && !sessionToken) {
  throw new Error("official mode requires --session-token or SESSION_TOKEN");
}

const startedAt = Date.now();
const results = [];

for (const testCase of cases) {
  const requestStartedAt = Date.now();
  const headers = {
    "content-type": "application/json"
  };

  if (mode === "official") {
    headers.authorization = `Bearer ${sessionToken}`;
  }

  if (mode === "byok") {
    if (process.env.BYOK_ENDPOINT) {
      headers["x-byok-endpoint"] = process.env.BYOK_ENDPOINT;
    }
    if (process.env.BYOK_KEY) {
      headers["x-byok-key"] = process.env.BYOK_KEY;
    }
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: testCase.prompt,
        mode,
        ...(model ? { model } : {})
      })
    });

    const latencyMs = Date.now() - requestStartedAt;
    const responseBody = await response.json().catch(() => ({}));

    const ok =
      response.ok &&
      responseBody?.batch &&
      Array.isArray(responseBody.batch.commands);

    results.push({
      id: testCase.id,
      domain: testCase.domain,
      latency_ms: latencyMs,
      ok,
      status: response.status,
      error_code: ok ? null : responseBody?.error?.code ?? null,
      error_message: ok ? null : responseBody?.error?.message ?? null
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
const summary = {
  dry_run: false,
  gateway_url: gatewayUrl,
  mode,
  model: model ?? null,
  case_file: path.relative(process.cwd(), absoluteCasesPath),
  total_cases: results.length,
  success_cases: successCount,
  failed_cases: failedResults.length,
  success_rate: toFixedNumber(successCount / Math.max(results.length, 1)),
  elapsed_ms: completedAt - startedAt,
  by_domain: buildDomainSummary(results),
  failures: failedResults,
  capability_gates: CAPABILITY_GATES
};

writeResult(summary, args.output);

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
  const lines = [
    "Usage: node scripts/bench/run-quality-benchmark.mjs [options]",
    "",
    "Options:",
    "  --dry-run                 Validate case file and print counts only",
    "  --cases <path>            Benchmark case file (default: benchmarks/command-quality-cases.json)",
    "  --gateway-url <url>       Gateway base URL (default: http://127.0.0.1:8787)",
    "  --mode <byok|official>    Compile mode (default: byok)",
    "  --model <model>           Optional model name override",
    "  --session-token <token>   Required for official mode",
    "  --output <path>           Write JSON result to a file",
    "  --help                    Show this help"
  ];
  console.log(lines.join("\n"));
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

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(sorted.length * p) - 1;
  const safeRank = Math.min(Math.max(rank, 0), sorted.length - 1);
  return sorted[safeRank];
}

function average(values) {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function toFixedNumber(value) {
  return Number(value.toFixed(4));
}

function writeResult(payload, outputPath) {
  const text = JSON.stringify(payload, null, 2);
  if (outputPath) {
    fs.writeFileSync(path.resolve(process.cwd(), outputPath), text);
  }
  console.log(text);
}
