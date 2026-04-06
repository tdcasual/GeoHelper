import type { ToolProvider } from "./types";

export const createWorkerToolProvider = (): ToolProvider => ({
  invoke: ({ tool, input }) => tool.execute(input)
});
