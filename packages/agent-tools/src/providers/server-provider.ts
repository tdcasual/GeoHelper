import type { ToolProvider } from "./types";

export const createServerToolProvider = (): ToolProvider => ({
  invoke: ({ tool, input }) => tool.execute(input)
});
