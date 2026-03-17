export interface CompileMetricsState {
  startedAt: string;
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
  agentRunTotal: number;
  agentRunSuccess: number;
  agentRunNeedsReview: number;
  agentRunDegraded: number;
  agentRunIterationSum: number;
}

export interface GatewayMetricsStore {
  readState: () => CompileMetricsState;
  writeState: (state: CompileMetricsState) => void;
  reset: () => void;
}

export const createEmptyCompileMetricsState = (
  startedAt = new Date().toISOString()
): CompileMetricsState => ({
  startedAt,
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
  perfUpstreamMsSum: 0,
  agentRunTotal: 0,
  agentRunSuccess: 0,
  agentRunNeedsReview: 0,
  agentRunDegraded: 0,
  agentRunIterationSum: 0
});

export const createMemoryMetricsStore = (): GatewayMetricsStore => {
  const startedAt = new Date().toISOString();
  let state = createEmptyCompileMetricsState(startedAt);

  return {
    readState: () => state,
    writeState: (nextState) => {
      state = nextState;
    },
    reset: () => {
      state = createEmptyCompileMetricsState(startedAt);
    }
  };
};
