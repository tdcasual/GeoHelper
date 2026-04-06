import { ensureToolPermissions, type ToolRunnerPolicy } from "./tool-policy";
import type { ToolRegistry } from "./tool-registry";

const redactValue = (value: unknown, redactPaths: string[]): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const clone = { ...(value as Record<string, unknown>) };
  for (const key of redactPaths) {
    if (key in clone) {
      clone[key] = "[REDACTED]";
    }
  }
  return clone;
};

export interface ToolRunAudit {
  input: unknown;
  output: unknown;
}

export interface ToolRunResult {
  output: unknown;
  attemptCount: number;
  audit: ToolRunAudit;
}

export interface ToolRunnerDeps extends ToolRunnerPolicy {
  registry: ToolRegistry;
}

export const createToolRunner = (deps: ToolRunnerDeps) => ({
  run: async (name: string, rawInput: unknown): Promise<ToolRunResult> => {
    const tool = deps.registry.getTool(name);
    if (!tool) {
      throw new Error("tool_not_found");
    }

    ensureToolPermissions(tool.permissions, deps.allowedPermissions);

    const parsedInput = tool.inputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      throw new Error("invalid_tool_input");
    }

    const maxAttempts = tool.retryable
      ? Math.max(1, deps.retryPolicy?.maxAttempts ?? 1)
      : 1;

    let attemptCount = 0;
    let lastError: unknown;

    while (attemptCount < maxAttempts) {
      attemptCount += 1;
      try {
        const rawOutput = await tool.execute(parsedInput.data);
        const parsedOutput = tool.outputSchema.safeParse(rawOutput);
        if (!parsedOutput.success) {
          throw new Error("invalid_tool_output");
        }

        return {
          output: parsedOutput.data,
          attemptCount,
          audit: {
            input: redactValue(parsedInput.data, tool.redactPaths ?? []),
            output: redactValue(parsedOutput.data, tool.redactPaths ?? [])
          }
        };
      } catch (error) {
        lastError = error;
        if (!tool.retryable || attemptCount >= maxAttempts) {
          throw error;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error("tool_run_failed");
  }
});
