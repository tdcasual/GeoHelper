const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const CONTROL_PLANE_PROBE_NAMES = new Set([
  "GET /api/v3/health",
  "GET /api/v3/ready"
]);

const asCheckList = (value) => (Array.isArray(value) ? value : []);

const resolveControlPlaneProbes = (smokeResult) => {
  const explicitProbes = asCheckList(smokeResult?.control_plane_probes);
  if (explicitProbes.length > 0) {
    return explicitProbes;
  }

  return asCheckList(smokeResult?.checks).filter((check) =>
    CONTROL_PLANE_PROBE_NAMES.has(check?.name)
  );
};

export const evaluateOpsThresholds = ({
  smokeResult,
  benchmarkResult,
  env = process.env
}) => {
  const failureReasons = [];

  const smokeChecks = asCheckList(smokeResult?.checks);
  const controlPlaneProbes = resolveControlPlaneProbes(smokeResult);
  if (
    smokeChecks.some(
      (check) =>
        check &&
        check.ok === false &&
        !CONTROL_PLANE_PROBE_NAMES.has(check.name)
    )
  ) {
    failureReasons.push("gateway_smoke_failed");
  }

  if (controlPlaneProbes.some((probe) => probe && probe.ok === false)) {
    failureReasons.push("control_plane_probe_failed");
  }

  const controlPlaneReadyProbe = controlPlaneProbes.find(
    (probe) => probe?.name === "GET /api/v3/ready"
  );
  if (controlPlaneReadyProbe?.ok === false) {
    failureReasons.push("control_plane_readiness_failed");
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
