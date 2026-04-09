export interface GatewayMetricsState {
  startedAt: string;
}

export interface GatewayMetricsStore {
  readState: () => GatewayMetricsState;
  writeState: (state: GatewayMetricsState) => void;
  reset: () => void;
}

export const createEmptyGatewayMetricsState = (
  startedAt = new Date().toISOString()
): GatewayMetricsState => ({
  startedAt
});

export const createMemoryMetricsStore = (): GatewayMetricsStore => {
  const startedAt = new Date().toISOString();
  let state = createEmptyGatewayMetricsState(startedAt);

  return {
    readState: () => state,
    writeState: (nextState) => {
      state = nextState;
    },
    reset: () => {
      state = createEmptyGatewayMetricsState(startedAt);
    }
  };
};
