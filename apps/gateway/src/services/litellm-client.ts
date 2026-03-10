import {
  isTransientUpstreamStatus,
  resolveUpstreamTargets,
  UpstreamTarget
} from "./model-router";

export type CompileMode = "byok" | "official";

export interface CompileContext {
  recentMessages?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  sceneTransactions?: Array<{
    sceneId: string;
    transactionId: string;
    commandCount: number;
  }>;
}

export interface CompileInput {
  message: string;
  mode: CompileMode;
  model?: string;
  byokEndpoint?: string;
  byokKey?: string;
  context?: CompileContext;
}

export type RequestCommandBatch = (input: CompileInput) => Promise<unknown>;

class LiteLLMRequestError extends Error {
  transient: boolean;
  statusCode?: number;

  constructor(
    message: string,
    options: {
      transient: boolean;
      statusCode?: number;
    }
  ) {
    super(message);
    this.name = "LiteLLMRequestError";
    this.transient = options.transient;
    this.statusCode = options.statusCode;
  }
}

const TRANSIENT_FETCH_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ETIMEDOUT"
]);

const parseJsonFromLLMContent = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    throw new Error("LITELLM_INVALID_JSON");
  }
};

const isTransientUpstreamError = (error: unknown): boolean => {
  if (error instanceof LiteLLMRequestError) {
    return error.transient;
  }

  if (error instanceof TypeError) {
    return true;
  }

  if (typeof error === "object" && error && "code" in error) {
    return TRANSIENT_FETCH_ERROR_CODES.has(
      String((error as { code?: unknown }).code ?? "")
    );
  }

  return false;
};

const buildUserPrompt = (input: CompileInput): string => {
  const contextLines: string[] = [];
  if (input.context?.recentMessages?.length) {
    const recent = input.context.recentMessages
      .slice(-8)
      .map(
        (item) =>
          `${item.role === "assistant" ? "Assistant" : "User"}: ${item.content}`
      )
      .join("\n");
    contextLines.push(`Recent conversation:\n${recent}`);
  }
  if (input.context?.sceneTransactions?.length) {
    const sceneSummary = input.context.sceneTransactions
      .slice(0, 8)
      .map(
        (item) =>
          `${item.sceneId}/${item.transactionId}: ${item.commandCount} commands`
      )
      .join("\n");
    contextLines.push(`Recent scene transactions:\n${sceneSummary}`);
  }

  return contextLines.length > 0
    ? `${contextLines.join("\n\n")}\n\nCurrent request:\n${input.message}`
    : input.message;
};

const requestBatchFromTarget = async (
  target: UpstreamTarget,
  userPrompt: string
): Promise<unknown> => {
  let response: Response;

  try {
    response = await fetch(`${target.endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(target.apiKey ? { authorization: `Bearer ${target.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: target.model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Return only valid JSON for a CommandBatch. Do not include markdown."
          },
          {
            role: "user",
            content: userPrompt
          }
        ]
      })
    });
  } catch (error) {
    if (isTransientUpstreamError(error)) {
      throw new LiteLLMRequestError("LITELLM_UPSTREAM_ERROR", {
        transient: true
      });
    }
    throw error;
  }

  if (!response.ok) {
    throw new LiteLLMRequestError("LITELLM_UPSTREAM_ERROR", {
      transient: isTransientUpstreamStatus(response.status),
      statusCode: response.status
    });
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const messageContent = payload.choices?.[0]?.message?.content;

  if (!messageContent) {
    throw new Error("LITELLM_EMPTY_RESPONSE");
  }

  return parseJsonFromLLMContent(messageContent);
};

export const requestCommandBatch: RequestCommandBatch = async (input) => {
  const userPrompt = buildUserPrompt(input);
  const targets = resolveUpstreamTargets(
    {
      byokEndpoint: input.byokEndpoint,
      byokKey: input.byokKey,
      model: input.model
    },
    process.env
  );

  let lastError: unknown;
  for (const [index, target] of targets.entries()) {
    try {
      return await requestBatchFromTarget(target, userPrompt);
    } catch (error) {
      lastError = error;
      if (!isTransientUpstreamError(error) || index === targets.length - 1) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("LITELLM_UPSTREAM_ERROR");
};
