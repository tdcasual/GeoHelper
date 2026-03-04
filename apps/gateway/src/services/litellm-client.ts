export type CompileMode = "byok" | "official";

export interface CompileInput {
  message: string;
  mode: CompileMode;
  model?: string;
  byokEndpoint?: string;
  byokKey?: string;
}

export type RequestCommandBatch = (input: CompileInput) => Promise<unknown>;

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

export const requestCommandBatch: RequestCommandBatch = async (input) => {
  const endpoint = (input.byokEndpoint ?? process.env.LITELLM_ENDPOINT ?? "")
    .replace(/\/+$/, "");
  const apiKey = input.byokKey ?? process.env.LITELLM_API_KEY ?? "";
  const model = input.model ?? process.env.LITELLM_MODEL ?? "gpt-4o-mini";

  if (!endpoint) {
    throw new Error("LITELLM_ENDPOINT_MISSING");
  }

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Return only valid JSON for a CommandBatch. Do not include markdown."
        },
        {
          role: "user",
          content: input.message
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error("LITELLM_UPSTREAM_ERROR");
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
