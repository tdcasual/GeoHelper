import { RuntimeApiError } from "../runtime/runtime-service";
import type { RuntimeCompileResponse } from "../runtime/types";
import type { ChatMode } from "../runtime/types";
import { buildUncertaintyFollowUpPrompt } from "./chat-result";
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

const normalizeLines = (items: string[]): string[] =>
  items.map((item) => item.trim()).filter(Boolean);

const toUncertaintyId = (label: string, index: number): string =>
  `unc_${label
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "") || index + 1}`;

const classifyReviewLines = (
  items: string[],
  mode: "summary" | "warning"
): {
  summaryItems: string[];
  warningItems: string[];
  uncertaintyItems: Array<{
    id: string;
    label: string;
    followUpPrompt: string;
    reviewStatus: "pending";
  }>;
} =>
  normalizeLines(items).reduce<{
    summaryItems: string[];
    warningItems: string[];
    uncertaintyItems: Array<{
      id: string;
      label: string;
      followUpPrompt: string;
      reviewStatus: "pending";
    }>;
  }>(
    (acc, line) => {
      if (line.startsWith("待确认：")) {
        const label = line.replace("待确认：", "").trim();
        if (label) {
          acc.uncertaintyItems.push({
            id: toUncertaintyId(label, acc.uncertaintyItems.length),
            label,
            followUpPrompt: buildUncertaintyFollowUpPrompt(label),
            reviewStatus: "pending"
          });
        }
        return acc;
      }

      if (
        mode === "warning" ||
        line.startsWith("注意：") ||
        line.startsWith("警告：")
      ) {
        acc.warningItems.push(line);
        return acc;
      }

      acc.summaryItems.push(line);
      return acc;
    },
    {
      summaryItems: [],
      warningItems: [],
      uncertaintyItems: []
    }
  );

export const buildAssistantMessageFromCompileResult = (input: {
  id: string;
  batch: RuntimeCompileResponse["batch"];
  traceId?: RuntimeCompileResponse["trace_id"];
  agentSteps?: RuntimeCompileResponse["agent_steps"];
}): ChatMessage => {
  const explanationReview = classifyReviewLines(input.batch.explanations, "summary");
  const postCheckReview = classifyReviewLines(input.batch.post_checks, "warning");
  const fallbackSummary = `已生成 ${input.batch.commands.length} 条指令`;
  const summaryItems =
    explanationReview.summaryItems.length > 0
      ? explanationReview.summaryItems
      : [fallbackSummary];

  return {
    id: input.id,
    role: "assistant",
    content: summaryItems.join("\n"),
    result: {
      status: "success",
      commandCount: input.batch.commands.length,
      summaryItems,
      explanationLines: normalizeLines(input.batch.explanations),
      warningItems: [
        ...explanationReview.warningItems,
        ...postCheckReview.warningItems
      ],
      uncertaintyItems: [
        ...explanationReview.uncertaintyItems,
        ...postCheckReview.uncertaintyItems
      ],
      canvasLinks: buildStudioCanvasLinks({
        summaryItems,
        warningItems: [
          ...explanationReview.warningItems,
          ...postCheckReview.warningItems
        ],
        uncertaintyItems: [
          ...explanationReview.uncertaintyItems,
          ...postCheckReview.uncertaintyItems
        ]
      })
    },
    traceId: input.traceId,
    agentSteps: Array.isArray(input.agentSteps) ? input.agentSteps : []
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
