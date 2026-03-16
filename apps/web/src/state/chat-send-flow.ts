import { RuntimeApiError } from "../runtime/runtime-service";
import type { RuntimeCompileResponse } from "../runtime/types";
import type { ChatMode } from "../runtime/types";
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
  content: input.guard.assistantMessage
});

export const buildAssistantMessageFromCompileResult = (input: {
  id: string;
  batch: RuntimeCompileResponse["batch"];
  traceId?: RuntimeCompileResponse["trace_id"];
  agentSteps?: RuntimeCompileResponse["agent_steps"];
}): ChatMessage => ({
  id: input.id,
  role: "assistant",
  content: `已生成 ${input.batch.commands.length} 条指令`,
  traceId: input.traceId,
  agentSteps: Array.isArray(input.agentSteps) ? input.agentSteps : []
});

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
}): ChatMessage => ({
  id: input.id,
  role: "assistant",
  content: isOfficialSessionExpiredError(input.error, input.mode)
    ? "官方会话已过期，请重新输入 Token"
    : input.error instanceof RuntimeApiError &&
        input.error.code === "RUNTIME_ATTACHMENTS_UNSUPPORTED"
      ? ATTACHMENT_CAPABILITY_MESSAGE
      : "生成失败，请重试"
});
