import type { ToolProvider } from "./types";

export interface ExternalToolProviderDeps {
  invoke: ToolProvider["invoke"];
}

export const createExternalToolProvider = (
  deps: ExternalToolProviderDeps
): ToolProvider => ({
  invoke: deps.invoke
});
