import type { RunEvent } from "@geohelper/agent-protocol";
import type { RunSnapshot } from "@geohelper/agent-store";

import { RuntimeApiError } from "../runtime/runtime-service";
import type { ChatMode } from "../runtime/types";
import { buildStudioCanvasLinks } from "./chat-result-linking";
import type {
  ChatAttachment,
  ChatMessage,
  ConversationThread
} from "./chat-store";
import type { SceneTransaction } from "./scene-store";
import type { CompileRuntimeOptions } from "./settings-store";

export const ATTACHMENT_CAPABILITY_MESSAGE =
  "当前运行时或模型未开启图片能力，请切换到支持图片的运行时或模型后重试。";

type DebugEventInput = {
  level: "info" | "error";
  message: string;
};

export type ChatSendGuard =
  | {
      kind: "official_unsupported";
      assistantMessage: string;
    }
  | {
      kind: "attachments_unsupported";
      assistantMessage: string;
    }
  | {
      kind: "byok_key_unavailable";
      assistantMessage: string;
      logEvent: DebugEventInput;
      openSettings: true;
    };

export const buildCompileContext = (input: {
  conversation: ConversationThread | undefined;
  sceneTransactions: SceneTransaction[];
}) => ({
  recentMessages:
    input.conversation?.messages.slice(-8).map((item) => ({
      role: item.role,
      content: item.content
    })) ?? [],
  sceneTransactions: input.sceneTransactions.slice(0, 8).map((tx) => ({
    sceneId: tx.sceneId,
    transactionId: tx.transactionId,
    commandCount: tx.commandCount
  }))
});

export const resolveChatSendGuard = (input: {
  mode: ChatMode;
  runtime: Partial<CompileRuntimeOptions>;
  attachments: ChatAttachment[];
}): ChatSendGuard | null => {
  const supportsOfficial =
    input.runtime.runtimeCapabilities?.supportsOfficialAuth ?? true;
  if (input.mode === "official" && !supportsOfficial) {
    return {
      kind: "official_unsupported",
      assistantMessage:
        "当前运行时不支持 Official 模式，请切换到 Gateway 运行时或改用 BYOK。"
    };
  }

  const supportsVision = input.runtime.runtimeCapabilities?.supportsVision ?? true;
  if (input.attachments.length > 0 && !supportsVision) {
    return {
      kind: "attachments_unsupported",
      assistantMessage: ATTACHMENT_CAPABILITY_MESSAGE
    };
  }

  const issue = input.runtime.byokRuntimeIssue;
  if (input.mode === "byok" && issue?.code === "BYOK_KEY_DECRYPT_FAILED") {
    return {
      kind: "byok_key_unavailable",
      assistantMessage: `BYOK 密钥不可用（预设：${issue.presetName}）。请在设置中重新填写 API Key 后重试。`,
      logEvent: {
        level: "error",
        message: `BYOK Key 恢复提示：${issue.presetName}`
      },
      openSettings: true
    };
  }

  return null;
};

export const buildAssistantMessageFromGuard = (input: {
  id: string;
  guard: ChatSendGuard;
}): ChatMessage => ({
  id: input.id,
  role: "assistant",
  content: input.guard.assistantMessage,
  result: {
    status: "guard",
    commandCount: 0,
    summaryItems: [input.guard.assistantMessage],
    explanationLines: [],
    warningItems: [],
    uncertaintyItems: [],
    canvasLinks: []
  }
});

const toUncertaintyId = (label: string, index: number): string =>
  `unc_${label
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "") || index + 1}`;

const getLatestArtifact = (
  snapshot: RunSnapshot,
  kind: "response" | "draft" | "tool_result" | "canvas_evidence"
) =>
  [...snapshot.artifacts]
    .filter((artifact) => artifact.kind === kind)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .at(-1);

const getCommandCount = (snapshot: RunSnapshot): number => {
  const toolResult = getLatestArtifact(snapshot, "tool_result");
  const inlineData =
    toolResult?.inlineData && typeof toolResult.inlineData === "object"
      ? (toolResult.inlineData as Record<string, unknown>)
      : null;
  const commandBatch =
    inlineData?.commandBatch && typeof inlineData.commandBatch === "object"
      ? (inlineData.commandBatch as {
          commands?: unknown[];
        })
      : null;
  const metadataCommandCount =
    typeof toolResult?.metadata.commandCount === "number"
      ? toolResult.metadata.commandCount
      : undefined;

  if (typeof metadataCommandCount === "number") {
    return metadataCommandCount;
  }

  return Array.isArray(commandBatch?.commands) ? commandBatch.commands.length : 0;
};

const buildSummaryFromSnapshot = (snapshot: RunSnapshot) => {
  const responseArtifact = getLatestArtifact(snapshot, "response");
  const draftArtifact = getLatestArtifact(snapshot, "draft");
  const responseData =
    responseArtifact?.inlineData && typeof responseArtifact.inlineData === "object"
      ? (responseArtifact.inlineData as Record<string, unknown>)
      : null;
  const draftData =
    draftArtifact?.inlineData && typeof draftArtifact.inlineData === "object"
      ? (draftArtifact.inlineData as Record<string, unknown>)
      : null;

  const responseSummary = Array.isArray(responseData?.summary)
    ? responseData.summary.filter((item): item is string => typeof item === "string")
    : [];
  const draftSummary = Array.isArray(draftData?.summary)
    ? draftData.summary.filter((item): item is string => typeof item === "string")
    : [];
  const title =
    typeof responseData?.title === "string"
      ? responseData.title
      : typeof draftData?.title === "string"
        ? draftData.title
        : "";
  const checkpointSummaries = snapshot.checkpoints
    .filter((checkpoint) => checkpoint.status === "pending")
    .map((checkpoint) => `等待处理：${checkpoint.title}`);
  const summaryItems =
    responseSummary.length > 0
      ? responseSummary
      : draftSummary.length > 0
        ? draftSummary
        : title
          ? [title]
          : checkpointSummaries.length > 0
            ? checkpointSummaries
            : [`Run 状态：${snapshot.run.status}`];

  return {
    summaryItems,
    explanationLines: draftSummary.length > 0 ? draftSummary : responseSummary
  };
};

const buildUncertaintyItems = (snapshot: RunSnapshot) =>
  snapshot.checkpoints
    .filter((checkpoint) => checkpoint.status === "pending")
    .map((checkpoint, index) => ({
      id: checkpoint.id || toUncertaintyId(checkpoint.title, index),
      label: checkpoint.title,
      followUpPrompt: checkpoint.prompt,
      reviewStatus: "pending" as const
    }));

const buildWarningItems = (snapshot: RunSnapshot): string[] =>
  snapshot.checkpoints
    .filter((checkpoint) => checkpoint.status === "pending")
    .map((checkpoint) => checkpoint.prompt);

type AgentStep = NonNullable<ChatMessage["agentSteps"]>[number];

const mapEventToAgentStep = (
  event: RunEvent
): AgentStep | null => {
  if (event.type !== "node.completed" || typeof event.payload.nodeId !== "string") {
    return null;
  }

  return {
    name: event.payload.nodeId,
    status: "ok",
    duration_ms:
      typeof event.payload.durationMs === "number" ? event.payload.durationMs : 0,
    detail:
      typeof event.payload.resultType === "string" ? event.payload.resultType : undefined
  };
};

export const buildAssistantMessageFromRunResult = (input: {
  id: string;
  snapshot: RunSnapshot;
  traceId?: string;
}): ChatMessage => {
  const summary = buildSummaryFromSnapshot(input.snapshot);
  const uncertaintyItems = buildUncertaintyItems(input.snapshot);
  const warningItems = buildWarningItems(input.snapshot);
  const canvasLinks = buildStudioCanvasLinks({
    summaryItems: summary.summaryItems,
    warningItems,
    uncertaintyItems
  });
  const commandCount = getCommandCount(input.snapshot);
  const isError = input.snapshot.run.status === "failed";
  const isGuard =
    input.snapshot.run.status === "queued" ||
    input.snapshot.run.status === "running" ||
    input.snapshot.run.status === "waiting_for_checkpoint";

  return {
    id: input.id,
    role: "assistant",
    content: summary.summaryItems.join("\n"),
    result: {
      status: isError ? "error" : isGuard ? "guard" : "success",
      commandCount,
      summaryItems: summary.summaryItems,
      explanationLines: summary.explanationLines,
      warningItems,
      uncertaintyItems,
      canvasLinks
    },
    platformRunId: input.snapshot.run.id,
    traceId: input.traceId,
    agentSteps: input.snapshot.events
      .map(mapEventToAgentStep)
      .filter(
        (step): step is NonNullable<ReturnType<typeof mapEventToAgentStep>> =>
          step !== null
      )
  };
};

export const isOfficialSessionExpiredError = (
  error: unknown,
  mode: ChatMode
): boolean =>
  error instanceof RuntimeApiError &&
  (error.code === "SESSION_EXPIRED" ||
    error.code === "MISSING_AUTH_HEADER") &&
  mode === "official";

export const buildAssistantMessageFromError = (input: {
  id: string;
  error: unknown;
  mode: ChatMode;
}): ChatMessage => {
  const content = isOfficialSessionExpiredError(input.error, input.mode)
    ? "官方会话已过期，请重新输入 Token"
    : input.error instanceof RuntimeApiError &&
        input.error.code === "RUNTIME_ATTACHMENTS_UNSUPPORTED"
      ? ATTACHMENT_CAPABILITY_MESSAGE
      : "生成失败，请重试";

  return {
    id: input.id,
    role: "assistant",
    content,
    result: {
      status: "error",
      commandCount: 0,
      summaryItems: [content],
      explanationLines: [],
      warningItems: [],
      uncertaintyItems: [],
      canvasLinks: []
    }
  };
};
