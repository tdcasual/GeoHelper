import { CommandBatch } from "@geohelper/protocol";

import { CompileInput, RequestCommandBatch } from "./litellm-client";
import {
  InvalidCommandBatchError,
  verifyCommandBatch
} from "./verify-command-batch";

export type AgentName =
  | "intent"
  | "planner"
  | "command"
  | "verifier"
  | "repair";
export type AgentStatus = "ok" | "fallback" | "error" | "skipped";

export interface AgentStep {
  name: AgentName;
  status: AgentStatus;
  duration_ms: number;
  detail?: string;
}

export interface MultiAgentResult {
  batch: CommandBatch;
  agent_steps: AgentStep[];
}

const now = (): number => Date.now();

const measure = async <T>(
  name: AgentName,
  steps: AgentStep[],
  fn: () => Promise<T>
): Promise<T> => {
  const startedAt = now();
  try {
    const value = await fn();
    steps.push({
      name,
      status: "ok",
      duration_ms: now() - startedAt
    });
    return value;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    steps.push({
      name,
      status: "error",
      duration_ms: now() - startedAt,
      detail
    });
    throw error;
  }
};

const safeObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const compileWithMultiAgent = async (
  input: CompileInput,
  requestCommandBatch: RequestCommandBatch
): Promise<MultiAgentResult> => {
  const steps: AgentStep[] = [];
  const intentFallback = {
    goal: input.message,
    constraints: []
  };

  let intent: Record<string, unknown> = intentFallback;
  try {
    intent = await measure("intent", steps, async () =>
      safeObject(
        await requestCommandBatch({
          ...input,
          message: `Intent extraction for geometry request: ${input.message}`
        })
      )
    );
  } catch {
    steps.push({
      name: "intent",
      status: "fallback",
      duration_ms: 0,
      detail: "Using deterministic fallback intent"
    });
    intent = intentFallback;
  }

  let plan: Record<string, unknown> = {
    steps: [{ title: "Generate GeoGebra commands", source: "fallback-plan" }]
  };
  try {
    plan = await measure("planner", steps, async () =>
      safeObject(
        await requestCommandBatch({
          ...input,
          message: `Planner output as JSON. Intent: ${JSON.stringify(intent)}`
        })
      )
    );
  } catch {
    steps.push({
      name: "planner",
      status: "fallback",
      duration_ms: 0,
      detail: "Using deterministic fallback plan"
    });
  }

  const rawBatch = await measure("command", steps, async () =>
    requestCommandBatch({
      ...input,
      message: `Generate CommandBatch JSON only. User: ${input.message}. Plan: ${JSON.stringify(
        plan
      )}`
    })
  );

  try {
    const batch = await measure("verifier", steps, async () =>
      Promise.resolve(verifyCommandBatch(rawBatch))
    );
    steps.push({
      name: "repair",
      status: "skipped",
      duration_ms: 0
    });
    return {
      batch,
      agent_steps: steps
    };
  } catch (error) {
    if (!(error instanceof InvalidCommandBatchError)) {
      throw error;
    }

    const repairedRaw = await measure("repair", steps, async () =>
      requestCommandBatch({
        ...input,
        message: `Repair invalid CommandBatch JSON. Issues: ${error.issues.join(
          "; "
        )}. Original: ${JSON.stringify(rawBatch)}`
      })
    );

    const repairedBatch = await measure("verifier", steps, async () =>
      Promise.resolve(verifyCommandBatch(repairedRaw))
    );

    return {
      batch: repairedBatch,
      agent_steps: steps
    };
  }
};
