import {
  createMemoryMetricsStore,
  GatewayMetricsStore
} from "./metrics-store";

const defaultMetricsStore = createMemoryMetricsStore();
const LATENCY_SAMPLE_LIMIT = 1_000;

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const position = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1)
  );
  return sorted[position];
};

const writeUpdatedState = (
  store: GatewayMetricsStore,
  update: (state: ReturnType<GatewayMetricsStore["readState"]>) => ReturnType<GatewayMetricsStore["readState"]>
): void => {
  const current = store.readState();
  const next = update({
    ...current,
    latencySamplesMs: [...current.latencySamplesMs]
  });
  store.writeState(next);
};

const pushLatencySample = (
  store: GatewayMetricsStore,
  latencyMs: number
): void => {
  writeUpdatedState(store, (state) => {
    state.latencySamplesMs.push(Math.max(0, latencyMs));
    if (state.latencySamplesMs.length > LATENCY_SAMPLE_LIMIT) {
      state.latencySamplesMs.shift();
    }
    return state;
  });
};

export const getDefaultMetricsStore = (): GatewayMetricsStore =>
  defaultMetricsStore;

export const recordCompileSuccess = (
  sample: {
    retryCount: number;
    latencyMs: number;
    hadFallback: boolean;
    costUsd?: number;
  },
  store: GatewayMetricsStore = defaultMetricsStore
): void => {
  writeUpdatedState(store, (state) => {
    state.totalRequests += 1;
    state.success += 1;
    state.totalRetryCount += Math.max(0, sample.retryCount);
    state.totalFallbackCount += sample.hadFallback ? 1 : 0;
    state.totalCostUsd += Math.max(0, sample.costUsd ?? 0);
    return state;
  });
  pushLatencySample(store, sample.latencyMs);
};

export const recordCompileFailure = (
  latencyMs: number,
  costUsd = 0,
  store: GatewayMetricsStore = defaultMetricsStore
): void => {
  writeUpdatedState(store, (state) => {
    state.totalRequests += 1;
    state.failed += 1;
    state.totalCostUsd += Math.max(0, costUsd);
    return state;
  });
  pushLatencySample(store, latencyMs);
};

export const recordCompileRateLimited = (
  store: GatewayMetricsStore = defaultMetricsStore
): void => {
  writeUpdatedState(store, (state) => {
    state.totalRequests += 1;
    state.rateLimited += 1;
    return state;
  });
};

export const resetGatewayMetrics = (
  store: GatewayMetricsStore = defaultMetricsStore
): void => {
  store.reset();
};

export const recordCompilePerfSample = (
  sample: {
    totalMs: number;
    upstreamMs: number;
  },
  store: GatewayMetricsStore = defaultMetricsStore
): void => {
  writeUpdatedState(store, (state) => {
    state.perfSampleCount += 1;
    state.perfTotalMsSum += Math.max(0, sample.totalMs);
    state.perfUpstreamMsSum += Math.max(0, sample.upstreamMs);
    return state;
  });
};

export const recordAgentRunQualitySample = (
  sample: {
    status: "success" | "needs_review" | "degraded" | "failed";
    iterationCount: number;
  },
  store: GatewayMetricsStore = defaultMetricsStore
): void => {
  writeUpdatedState(store, (state) => {
    state.agentRunTotal += 1;
    state.agentRunIterationSum += Math.max(0, sample.iterationCount);
    if (sample.status === "success") {
      state.agentRunSuccess += 1;
    } else if (sample.status === "needs_review") {
      state.agentRunNeedsReview += 1;
    } else if (sample.status === "degraded") {
      state.agentRunDegraded += 1;
    }
    return state;
  });
};

export const getGatewayMetricsSnapshot = (
  store: GatewayMetricsStore = defaultMetricsStore
) => {
  const state = store.readState();
  const successRate =
    state.totalRequests === 0 ? 0 : state.success / state.totalRequests;
  const rateLimitedRatio =
    state.totalRequests === 0
      ? 0
      : state.rateLimited / state.totalRequests;
  const averageRetryCount =
    state.success === 0 ? 0 : state.totalRetryCount / state.success;
  const compileAttemptCount = state.success + state.failed;
  const fallbackRate =
    compileAttemptCount === 0
      ? 0
      : state.totalFallbackCount / compileAttemptCount;
  const costPerRequestUsd =
    compileAttemptCount === 0 ? 0 : state.totalCostUsd / compileAttemptCount;
  const p95LatencyMs = percentile(state.latencySamplesMs, 0.95);
  const perfTotalAvg =
    state.perfSampleCount === 0
      ? 0
      : state.perfTotalMsSum / state.perfSampleCount;
  const perfUpstreamAvg =
    state.perfSampleCount === 0
      ? 0
      : state.perfUpstreamMsSum / state.perfSampleCount;

  return {
    started_at: state.startedAt,
    compile: {
      total_requests: state.totalRequests,
      success: state.success,
      failed: state.failed,
      rate_limited: state.rateLimited,
      success_rate: Number(successRate.toFixed(4)),
      rate_limited_ratio: Number(rateLimitedRatio.toFixed(4)),
      average_retry_count: Number(averageRetryCount.toFixed(4)),
      fallback_count: state.totalFallbackCount,
      fallback_rate: Number(fallbackRate.toFixed(4)),
      total_cost_usd: Number(state.totalCostUsd.toFixed(6)),
      cost_per_request_usd: Number(costPerRequestUsd.toFixed(6)),
      p95_latency_ms: Number(p95LatencyMs.toFixed(4)),
      perf_sample_count: state.perfSampleCount,
      perf_total_ms_avg: Number(perfTotalAvg.toFixed(4)),
      perf_upstream_ms_avg: Number(perfUpstreamAvg.toFixed(4))
    },
    agent_runs: {
      total_runs: state.agentRunTotal,
      success: state.agentRunSuccess,
      needs_review: state.agentRunNeedsReview,
      degraded: state.agentRunDegraded,
      average_iteration_count:
        state.agentRunTotal === 0
          ? 0
          : Number(
              (state.agentRunIterationSum / state.agentRunTotal).toFixed(4)
            )
    }
  };
};
