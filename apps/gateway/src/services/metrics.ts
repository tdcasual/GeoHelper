interface CompileMetrics {
  totalRequests: number;
  success: number;
  failed: number;
  rateLimited: number;
  totalRetryCount: number;
  totalFallbackCount: number;
  totalCostUsd: number;
  latencySamplesMs: number[];
  perfSampleCount: number;
  perfTotalMsSum: number;
  perfUpstreamMsSum: number;
}

const metrics: CompileMetrics = {
  totalRequests: 0,
  success: 0,
  failed: 0,
  rateLimited: 0,
  totalRetryCount: 0,
  totalFallbackCount: 0,
  totalCostUsd: 0,
  latencySamplesMs: [],
  perfSampleCount: 0,
  perfTotalMsSum: 0,
  perfUpstreamMsSum: 0
};

const startedAt = new Date().toISOString();

const LATENCY_SAMPLE_LIMIT = 1_000;

const pushLatencySample = (latencyMs: number): void => {
  metrics.latencySamplesMs.push(Math.max(0, latencyMs));
  if (metrics.latencySamplesMs.length > LATENCY_SAMPLE_LIMIT) {
    metrics.latencySamplesMs.shift();
  }
};

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

export const recordCompileSuccess = (sample: {
  retryCount: number;
  latencyMs: number;
  hadFallback: boolean;
  costUsd?: number;
}): void => {
  metrics.totalRequests += 1;
  metrics.success += 1;
  metrics.totalRetryCount += Math.max(0, sample.retryCount);
  metrics.totalFallbackCount += sample.hadFallback ? 1 : 0;
  metrics.totalCostUsd += Math.max(0, sample.costUsd ?? 0);
  pushLatencySample(sample.latencyMs);
};

export const recordCompileFailure = (
  latencyMs: number,
  costUsd = 0
): void => {
  metrics.totalRequests += 1;
  metrics.failed += 1;
  metrics.totalCostUsd += Math.max(0, costUsd);
  pushLatencySample(latencyMs);
};

export const recordCompileRateLimited = (): void => {
  metrics.totalRequests += 1;
  metrics.rateLimited += 1;
};

export const resetGatewayMetrics = (): void => {
  metrics.totalRequests = 0;
  metrics.success = 0;
  metrics.failed = 0;
  metrics.rateLimited = 0;
  metrics.totalRetryCount = 0;
  metrics.totalFallbackCount = 0;
  metrics.totalCostUsd = 0;
  metrics.latencySamplesMs = [];
  metrics.perfSampleCount = 0;
  metrics.perfTotalMsSum = 0;
  metrics.perfUpstreamMsSum = 0;
};

export const recordCompilePerfSample = (sample: {
  totalMs: number;
  upstreamMs: number;
}): void => {
  metrics.perfSampleCount += 1;
  metrics.perfTotalMsSum += Math.max(0, sample.totalMs);
  metrics.perfUpstreamMsSum += Math.max(0, sample.upstreamMs);
};

export const getGatewayMetricsSnapshot = () => {
  const successRate =
    metrics.totalRequests === 0 ? 0 : metrics.success / metrics.totalRequests;
  const rateLimitedRatio =
    metrics.totalRequests === 0
      ? 0
      : metrics.rateLimited / metrics.totalRequests;
  const averageRetryCount =
    metrics.success === 0 ? 0 : metrics.totalRetryCount / metrics.success;
  const compileAttemptCount = metrics.success + metrics.failed;
  const fallbackRate =
    compileAttemptCount === 0
      ? 0
      : metrics.totalFallbackCount / compileAttemptCount;
  const costPerRequestUsd =
    compileAttemptCount === 0 ? 0 : metrics.totalCostUsd / compileAttemptCount;
  const p95LatencyMs = percentile(metrics.latencySamplesMs, 0.95);
  const perfTotalAvg =
    metrics.perfSampleCount === 0
      ? 0
      : metrics.perfTotalMsSum / metrics.perfSampleCount;
  const perfUpstreamAvg =
    metrics.perfSampleCount === 0
      ? 0
      : metrics.perfUpstreamMsSum / metrics.perfSampleCount;

  return {
    started_at: startedAt,
    compile: {
      total_requests: metrics.totalRequests,
      success: metrics.success,
      failed: metrics.failed,
      rate_limited: metrics.rateLimited,
      success_rate: Number(successRate.toFixed(4)),
      rate_limited_ratio: Number(rateLimitedRatio.toFixed(4)),
      average_retry_count: Number(averageRetryCount.toFixed(4)),
      fallback_count: metrics.totalFallbackCount,
      fallback_rate: Number(fallbackRate.toFixed(4)),
      total_cost_usd: Number(metrics.totalCostUsd.toFixed(6)),
      cost_per_request_usd: Number(costPerRequestUsd.toFixed(6)),
      p95_latency_ms: Number(p95LatencyMs.toFixed(4)),
      perf_sample_count: metrics.perfSampleCount,
      perf_total_ms_avg: Number(perfTotalAvg.toFixed(4)),
      perf_upstream_ms_avg: Number(perfUpstreamAvg.toFixed(4))
    }
  };
};
