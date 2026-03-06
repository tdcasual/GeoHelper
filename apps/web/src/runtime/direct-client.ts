import { RuntimeApiError, RuntimeClient } from "./orchestrator";
import { parseJsonFromLlmContent, verifyCommandBatch } from "./compile-pipeline";

const directCapabilities = {
  supportsOfficialAuth: false,
  supportsVision: true,
  supportsAgentSteps: false,
  supportsServerMetrics: false,
  supportsRateLimitHeaders: false
} as const;

const normalizeBaseUrl = (value?: string): string => (value ?? "").trim().replace(/\/+$/, "");

const buildContextMessage = (input: {
  message: string;
  context?: {
    recentMessages?: Array<{
      role: "user" | "assistant";
      content: string;
    }>;
    sceneTransactions?: Array<{
      sceneId: string;
      transactionId: string;
      commandCount: number;
    }>;
  };
}): string => {
  const sections: string[] = [];
  if (input.context?.recentMessages?.length) {
    const recent = input.context.recentMessages
      .slice(-8)
      .map(
        (item) =>
          `${item.role === "assistant" ? "Assistant" : "User"}: ${item.content}`
      )
      .join("\n");
    sections.push(`Recent conversation:\n${recent}`);
  }
  if (input.context?.sceneTransactions?.length) {
    const sceneSummary = input.context.sceneTransactions
      .slice(0, 8)
      .map(
        (item) =>
          `${item.sceneId}/${item.transactionId}: ${item.commandCount} commands`
      )
      .join("\n");
    sections.push(`Recent scene transactions:\n${sceneSummary}`);
  }

  if (sections.length === 0) {
    return input.message;
  }

  return `${sections.join("\n\n")}\n\nCurrent request:\n${input.message}`;
};

const buildUserContent = (request: {
  message: string;
  attachments?: Array<{
    transportPayload: string;
  }>;
  context?: {
    recentMessages?: Array<{
      role: "user" | "assistant";
      content: string;
    }>;
    sceneTransactions?: Array<{
      sceneId: string;
      transactionId: string;
      commandCount: number;
    }>;
  };
}) => {
  const message = buildContextMessage({
    message: request.message,
    context: request.context
  });
  if (!request.attachments || request.attachments.length === 0) {
    return message;
  }

  return [
    {
      type: "text",
      text: message
    },
    ...request.attachments.map((attachment) => ({
      type: "image_url" as const,
      image_url: {
        url: attachment.transportPayload
      }
    }))
  ];
};

export const createDirectClient = (): RuntimeClient => ({
  target: "direct",
  capabilities: directCapabilities,

  compile: async (request) => {
    if (request.mode === "official") {
      throw new RuntimeApiError(
        "RUNTIME_MODE_UNSUPPORTED",
        "Direct runtime does not support official mode",
        400
      );
    }

    const endpoint = normalizeBaseUrl(request.byokEndpoint ?? request.baseUrl);
    if (!endpoint) {
      throw new RuntimeApiError(
        "RUNTIME_NOT_CONFIGURED",
        "Direct runtime endpoint is missing. Configure base_url in BYOK settings.",
        400
      );
    }

    const model = request.model?.trim() || "gpt-4o-mini";
    const headers: Record<string, string> = {
      "content-type": "application/json"
    };
    if (request.byokKey) {
      headers.authorization = `Bearer ${request.byokKey}`;
    }

    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : undefined;
    const timeoutHandle =
      controller && request.timeoutMs && request.timeoutMs > 0
        ? setTimeout(() => controller.abort(), request.timeoutMs)
        : undefined;
    const startedAt = Date.now();

    let response: Response;
    try {
      response = await fetch(`${endpoint}/chat/completions`, {
        method: "POST",
        headers,
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
              content: buildUserContent(request)
            }
          ]
        }),
        signal: controller?.signal
      });
    } catch (error) {
      if (error instanceof TypeError) {
        throw new RuntimeApiError(
          "CORS_BLOCKED",
          "Direct upstream request was blocked by browser CORS policy",
          0
        );
      }
      throw new RuntimeApiError(
        "DIRECT_UPSTREAM_NETWORK_ERROR",
        "Failed to request direct upstream endpoint",
        502
      );
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }

    if (!response.ok) {
      const payload = (await response
        .json()
        .catch(() => ({}))) as { error?: { message?: string } };
      throw new RuntimeApiError(
        "DIRECT_UPSTREAM_ERROR",
        payload.error?.message ?? "Direct upstream request failed",
        response.status
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const messageContent = payload.choices?.[0]?.message?.content;
    if (!messageContent) {
      throw new RuntimeApiError(
        "LITELLM_EMPTY_RESPONSE",
        "Direct upstream response is empty",
        502
      );
    }

    const batch = verifyCommandBatch(parseJsonFromLlmContent(messageContent));
    return {
      trace_id: `direct_${Date.now()}`,
      batch,
      agent_steps: [
        {
          name: "command",
          status: "ok",
          duration_ms: Date.now() - startedAt
        }
      ]
    };
  }
});
