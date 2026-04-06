import type { AnyToolDefinition } from "./tool-definition";

export interface ToolManifest {
  name: string;
  kind: string;
  permissions: string[];
  retryable: boolean;
  timeoutMs?: number;
}

export const createToolManifest = (
  definition: Pick<
    AnyToolDefinition,
    "name" | "kind" | "permissions" | "retryable" | "timeoutMs"
  >
): ToolManifest => ({
  name: definition.name,
  kind: definition.kind,
  permissions: [...definition.permissions],
  retryable: definition.retryable,
  ...(typeof definition.timeoutMs === "number"
    ? {
        timeoutMs: definition.timeoutMs
      }
    : {})
});
