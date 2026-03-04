interface CompileMetrics {
  totalRequests: number;
  success: number;
  failed: number;
  rateLimited: number;
  totalRetryCount: number;
}

const metrics: CompileMetrics = {
  totalRequests: 0,
  success: 0,
  failed: 0,
  rateLimited: 0,
  totalRetryCount: 0
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

  return {
    started_at: startedAt,
    compile: {
      total_requests: metrics.totalRequests,
      success: metrics.success,
      failed: metrics.failed,
      rate_limited: metrics.rateLimited,
      success_rate: Number(successRate.toFixed(4)),
      rate_limited_ratio: Number(rateLimitedRatio.toFixed(4)),
      average_retry_count: Number(averageRetryCount.toFixed(4))
    }
  };
};
