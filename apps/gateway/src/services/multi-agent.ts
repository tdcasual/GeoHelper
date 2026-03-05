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
  upstream_ms: number;
  upstream_calls: number;
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

const buildContextSuffix = (input: CompileInput): string => {
  const sections: string[] = [];
  if (input.context?.recentMessages?.length) {
    const lines = input.context.recentMessages
      .slice(-8)
      .map(
        (item) =>
          `${item.role === "assistant" ? "Assistant" : "User"}: ${item.content}`
      );
    sections.push(`Recent conversation:\n${lines.join("\n")}`);
  }
  if (input.context?.sceneTransactions?.length) {
    const lines = input.context.sceneTransactions
      .slice(0, 8)
      .map(
        (item) =>
          `${item.sceneId}/${item.transactionId}: ${item.commandCount} commands`
      );
    sections.push(`Recent scene transactions:\n${lines.join("\n")}`);
  }

  return sections.length > 0 ? `\n\n${sections.join("\n\n")}` : "";
};

export const compileWithMultiAgent = async (
  input: CompileInput,
  requestCommandBatch: RequestCommandBatch
): Promise<MultiAgentResult> => {
  const contextSuffix = buildContextSuffix(input);
  const steps: AgentStep[] = [];
  let upstreamMs = 0;
  let upstreamCalls = 0;
  const requestWithTimer: RequestCommandBatch = async (nextInput) => {
    upstreamCalls += 1;
    const startedAt = now();
    try {
      return await requestCommandBatch(nextInput);
    } finally {
      upstreamMs += now() - startedAt;
    }
  };
  const intentFallback = {
    goal: input.message,
    constraints: []
  };

  let intent: Record<string, unknown> = intentFallback;
  try {
    intent = await measure("intent", steps, async () =>
      safeObject(
        await requestWithTimer({
          ...input,
          message: `Intent extraction for geometry request: ${input.message}${contextSuffix}`
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
        await requestWithTimer({
          ...input,
          message: `Planner output as JSON. Intent: ${JSON.stringify(intent)}${contextSuffix}`
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
    requestWithTimer({
      ...input,
      message: `Generate CommandBatch JSON only. User: ${input.message}. Plan: ${JSON.stringify(
        plan
      )}${contextSuffix}`
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
      agent_steps: steps,
      upstream_ms: upstreamMs,
      upstream_calls: upstreamCalls
    };
  } catch (error) {
    if (!(error instanceof InvalidCommandBatchError)) {
      throw error;
    }

    const repairedRaw = await measure("repair", steps, async () =>
      requestWithTimer({
        ...input,
        message: `Repair invalid CommandBatch JSON. Issues: ${error.issues.join(
          "; "
        )}. Original: ${JSON.stringify(rawBatch)}${contextSuffix}`
      })
    );

    const repairedBatch = await measure("verifier", steps, async () =>
      Promise.resolve(verifyCommandBatch(repairedRaw))
    );

    return {
      batch: repairedBatch,
      agent_steps: steps,
      upstream_ms: upstreamMs,
      upstream_calls: upstreamCalls
    };
  }
};

export const compileWithSingleAgent = async (
  input: CompileInput,
  requestCommandBatch: RequestCommandBatch
): Promise<MultiAgentResult> => {
  const startedAt = now();
  const raw = await requestCommandBatch(input);
  const upstreamMs = now() - startedAt;

  const verified = verifyCommandBatch(raw);
  return {
    batch: verified,
    agent_steps: [
      {
        name: "command",
        status: "ok",
        duration_ms: upstreamMs
      }
    ],
    upstream_ms: upstreamMs,
    upstream_calls: 1
  };
};
