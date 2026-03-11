const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const evaluateOpsThresholds = ({
  smokeResult,
  benchmarkResult,
  env = process.env
}) => {
  const failureReasons = [];

  const smokeChecks = Array.isArray(smokeResult?.checks) ? smokeResult.checks : [];
  if (smokeChecks.some((check) => check && check.ok === false)) {
    failureReasons.push("gateway_smoke_failed");
  }

  const minSuccessRate = toFiniteNumber(env.OPS_BENCH_MIN_SUCCESS_RATE);
  if (
    minSuccessRate !== null &&
    typeof benchmarkResult?.success_rate === "number" &&
    benchmarkResult.success_rate < minSuccessRate
  ) {
    failureReasons.push("benchmark_success_rate_below_threshold");
  }

  const maxP95Ms = toFiniteNumber(env.OPS_BENCH_MAX_P95_MS);
  if (maxP95Ms !== null) {
    const domains = benchmarkResult?.by_domain && typeof benchmarkResult.by_domain === "object"
      ? Object.values(benchmarkResult.by_domain)
      : [];
    if (
      domains.some(
        (value) =>
          value &&
          typeof value === "object" &&
          typeof value.p95_latency_ms === "number" &&
          value.p95_latency_ms > maxP95Ms
      )
    ) {
      failureReasons.push("benchmark_p95_latency_above_threshold");
    }
  }

  return {
    status: failureReasons.length > 0 ? "failed" : "ok",
    failureReasons
  };
};
