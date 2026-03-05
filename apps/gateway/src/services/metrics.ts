interface CompileMetrics {
  totalRequests: number;
  success: number;
  failed: number;
  rateLimited: number;
  totalRetryCount: number;
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
  perfSampleCount: 0,
  perfTotalMsSum: 0,
  perfUpstreamMsSum: 0
};

const startedAt = new Date().toISOString();

export const recordCompileSuccess = (retryCount: number): void => {
  metrics.totalRequests += 1;
  metrics.success += 1;
  metrics.totalRetryCount += Math.max(0, retryCount);
};

export const recordCompileFailure = (): void => {
  metrics.totalRequests += 1;
  metrics.failed += 1;
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
      perf_sample_count: metrics.perfSampleCount,
      perf_total_ms_avg: Number(perfTotalAvg.toFixed(4)),
      perf_upstream_ms_avg: Number(perfUpstreamAvg.toFixed(4))
    }
  };
};
