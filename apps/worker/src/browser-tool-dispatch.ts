export interface BrowserToolResult {
  runId: string;
  checkpointId: string;
  output: unknown;
}

export interface BrowserToolDispatch {
  submitResult: (result: BrowserToolResult) => void;
  consumeResult: (runId: string) => BrowserToolResult | null;
}

export const createBrowserToolDispatch = (): BrowserToolDispatch => {
  const resultsByRun = new Map<string, BrowserToolResult>();

  return {
    submitResult: (result) => {
      resultsByRun.set(result.runId, result);
    },
    consumeResult: (runId) => {
      const result = resultsByRun.get(runId) ?? null;

      if (result) {
        resultsByRun.delete(runId);
      }

      return result;
    }
  };
};
