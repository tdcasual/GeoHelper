import { type AgentRunStatus, type RuntimeAttachment } from "@geohelper/protocol";

import { type CompileFinalStatus } from "../services/compile-events";
import { type CompileContext } from "../services/litellm-client";

interface RawCompileContext {
  recentMessages?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  recent_messages?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  sceneTransactions?: Array<{
    sceneId: string;
    transactionId: string;
    commandCount: number;
  }>;
  scene_transactions?: Array<{
    scene_id: string;
    transaction_id: string;
    command_count: number;
  }>;
}

export const normalizeCompileContext = (
  raw?: RawCompileContext
): CompileContext | undefined => {
  if (!raw) {
    return undefined;
  }

  const recentMessages = raw.recentMessages ?? raw.recent_messages;
  const sceneTransactions =
    raw.sceneTransactions ??
    raw.scene_transactions?.map((item) => ({
      sceneId: item.scene_id,
      transactionId: item.transaction_id,
      commandCount: item.command_count
    }));

  if (!recentMessages?.length && !sceneTransactions?.length) {
    return undefined;
  }

  return {
    recentMessages,
    sceneTransactions
  };
};

export const summarizeCompileAttachments = (
  attachments?: RuntimeAttachment[]
): Record<string, unknown> | undefined => {
  if (!attachments?.length) {
    return undefined;
  }

  return {
    attachments_count: attachments.length,
    attachment_kinds: [...new Set(attachments.map((attachment) => attachment.kind))]
  };
};

export const mergeCompileMetadata = (
  ...parts: Array<Record<string, unknown> | undefined>
): Record<string, unknown> | undefined => {
  const merged = Object.assign({}, ...parts.filter(Boolean));
  return Object.keys(merged).length > 0 ? merged : undefined;
};

export const toCompileFinalStatusFromAgentRun = (
  status: AgentRunStatus
): Extract<CompileFinalStatus, "success" | "needs_review" | "degraded"> => {
  switch (status) {
    case "success":
    case "needs_review":
    case "degraded":
      return status;
    case "failed":
      return "needs_review";
  }
};
