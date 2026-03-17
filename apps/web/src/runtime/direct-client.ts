import {
  type AgentRunEnvelope,
  type CommandBatch,
  type GeometryCanvasLink,
  type GeometryTeacherUncertainty
} from "@geohelper/protocol";

import { parseJsonFromLlmContent, verifyCommandBatch } from "./compile-pipeline";
import { RuntimeApiError, RuntimeClient } from "./orchestrator";

const directCapabilities = {
  supportsOfficialAuth: false,
  supportsVision: true,
  supportsAgentSteps: true,
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
  repair?: {
    sourceRun: AgentRunEnvelope;
    teacherInstruction: string;
    canvasEvidence: {
      visibleLabels: string[];
      createdLabels?: string[];
      teacherFocus?: string;
      executedCommandCount: number;
    };
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
  if (input.repair) {
    sections.push(
      `Repair context:\nTeacher instruction: ${input.repair.teacherInstruction}\nSource draft: ${JSON.stringify(
        {
          normalizedIntent: input.repair.sourceRun.draft.normalizedIntent,
          namingPlan: input.repair.sourceRun.draft.namingPlan,
          reviewChecklist: input.repair.sourceRun.draft.reviewChecklist
        }
      )}\nCanvas evidence: ${JSON.stringify({
        executedCommandCount: input.repair.canvasEvidence.executedCommandCount,
        visibleLabels: input.repair.canvasEvidence.visibleLabels,
        createdLabels: input.repair.canvasEvidence.createdLabels ?? [],
        teacherFocus: input.repair.canvasEvidence.teacherFocus ?? null
      })}`
    );
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
  repair?: {
    sourceRun: AgentRunEnvelope;
    teacherInstruction: string;
    canvasEvidence: {
      visibleLabels: string[];
      createdLabels?: string[];
      teacherFocus?: string;
      executedCommandCount: number;
    };
  };
}) => {
  const message = buildContextMessage({
    message: request.message,
    context: request.context,
    repair: request.repair
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

const normalizeLines = (items: string[]): string[] =>
  items.map((item) => item.trim()).filter(Boolean);

const toUncertaintyId = (label: string, index: number): string =>
  `unc_${label
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "") || index + 1}`;

const extractBatchInventory = (
  batch: CommandBatch
): {
  referencedLabels: string[];
  generatedLabels: string[];
} => {
  const referenced = new Set<string>();
  const generated = new Set<string>();

  const readText = (value: unknown): string =>
    typeof value === "string" ? value.trim() : "";

  for (const command of batch.commands) {
    const args = command.args as Record<string, unknown>;
    const generatedLabel =
      command.op === "create_point" || command.op === "create_slider"
        ? readText(args.name)
        : "";
    if (generatedLabel) {
      generated.add(generatedLabel);
      referenced.add(generatedLabel);
    }

    for (const label of [
      readText(args.from),
      readText(args.to),
      readText(args.center),
      command.op === "set_property" ? readText(args.name) : ""
    ]) {
      if (label) {
        referenced.add(label);
      }
    }
  }

  return {
    referencedLabels: [...referenced],
    generatedLabels: [...generated]
  };
};

const classifyReviewLines = (
  items: string[]
): {
  warnings: string[];
  uncertainties: GeometryTeacherUncertainty[];
} =>
  normalizeLines(items).reduce<{
    warnings: string[];
    uncertainties: GeometryTeacherUncertainty[];
  }>(
    (acc, line) => {
      if (line.startsWith("待确认：")) {
        const label = line.replace("待确认：", "").trim();
        if (label) {
          acc.uncertainties.push({
            id: toUncertaintyId(label, acc.uncertainties.length),
            label,
            followUpPrompt: `请基于当前图形结果，重新检查并明确以下待确认条件：${label}。如果条件不成立，也请直接指出。`,
            reviewStatus: "pending"
          });
        }
        return acc;
      }

      acc.warnings.push(line);
      return acc;
    },
    {
      warnings: [],
      uncertainties: []
    }
  );

const buildCanvasLinks = (
  uncertainties: GeometryTeacherUncertainty[],
  objectLabels: string[]
): GeometryCanvasLink[] => {
  if (objectLabels.length === 0) {
    return [];
  }

  return uncertainties.map((item) => ({
    id: `link_${item.id}`,
    scope: "uncertainty",
    text: item.label,
    objectLabels,
    uncertaintyId: item.id
  }));
};

const buildDirectAgentRunEnvelope = (input: {
  traceId: string;
  request: {
    message: string;
    mode: "byok" | "official";
  };
  batch: CommandBatch;
  startedAt: number;
  finishedAt: number;
}): AgentRunEnvelope => {
  const inventory = extractBatchInventory(input.batch);
  const summary = normalizeLines(input.batch.explanations);
  const review = classifyReviewLines(input.batch.post_checks);
  const summaryItems =
    summary.length > 0 ? summary : [`已生成 ${input.batch.commands.length} 条指令`];
  const focusLabels =
    inventory.generatedLabels.length > 0
      ? inventory.generatedLabels
      : inventory.referencedLabels;

  return {
    run: {
      id: input.traceId,
      target: "direct",
      mode: input.request.mode,
      status: "success",
      iterationCount: 1,
      startedAt: new Date(input.startedAt).toISOString(),
      finishedAt: new Date(input.finishedAt).toISOString(),
      totalDurationMs: Math.max(0, input.finishedAt - input.startedAt)
    },
    draft: {
      normalizedIntent: input.request.message,
      assumptions: [],
      constructionPlan: summaryItems,
      namingPlan:
        inventory.generatedLabels.length > 0
          ? inventory.generatedLabels
          : inventory.referencedLabels,
      commandBatchDraft: input.batch,
      teachingOutline: summaryItems,
      reviewChecklist: normalizeLines(input.batch.post_checks)
    },
    reviews: [],
    evidence: {
      preflight: {
        status: "passed",
        issues: [],
        referencedLabels: inventory.referencedLabels,
        generatedLabels: inventory.generatedLabels
      }
    },
    teacherPacket: {
      summary: summaryItems,
      warnings: review.warnings,
      uncertainties: review.uncertainties,
      nextActions: ["执行到画布", "继续课堂讲解或修正"],
      canvasLinks: buildCanvasLinks(review.uncertainties, focusLabels)
    },
    telemetry: {
      upstreamCallCount: 1,
      degraded: false,
      stages: [
        {
          name: "author",
          status: "ok",
          durationMs: Math.max(0, input.finishedAt - input.startedAt)
        }
      ],
      retryCount: 0
    }
  };
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
    const finishedAt = Date.now();
    const traceId = `direct_${finishedAt}`;
    return {
      trace_id: traceId,
      agent_run: buildDirectAgentRunEnvelope({
        traceId,
        request: {
          message: request.message,
          mode: request.mode
        },
        batch,
        startedAt,
        finishedAt
      })
    };
  }
});
