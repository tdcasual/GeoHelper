import type { ToolProvider } from "./types";

export interface BrowserToolProviderDeps {
  invoke: ToolProvider["invoke"];
}

export const createBrowserToolProvider = (
  deps: BrowserToolProviderDeps
): ToolProvider => ({
  invoke: deps.invoke
});
