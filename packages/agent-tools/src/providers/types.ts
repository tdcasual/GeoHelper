import type { AnyToolDefinition } from "../tool-definition";

export type ToolProviderKind = "server" | "worker" | "browser" | "external";

export interface ToolProviderRequest {
  tool: AnyToolDefinition;
  input: unknown;
}

export interface ToolProvider {
  invoke: (
    request: ToolProviderRequest
  ) => Promise<unknown> | unknown;
}

export type ToolProviderMap = Partial<Record<ToolProviderKind, ToolProvider>>;

export const toToolProviderKind = (
  kind: AnyToolDefinition["kind"]
): ToolProviderKind => {
  if (kind === "server_tool") {
    return "server";
  }

  if (kind === "worker_tool") {
    return "worker";
  }

  if (kind === "browser_tool") {
    return "browser";
  }

  return "external";
};
