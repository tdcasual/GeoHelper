import type { ChatStudioUncertaintyItem } from "../state/chat-result";
import type { ChatMessage } from "../state/chat-store";
import { resolveProofAssistActions } from "./proof-assist-actions";

export interface StudioResultAction {
  id: "add_auxiliary" | "generate_explanation" | "attempt_proof";
  label: string;
  prompt: string;
  disabled: boolean;
  reason?: string;
}

export interface StudioResultStep {
  label: string;
  status: string;
  durationMs: number;
}

export interface StudioResultViewModel {
  status: "idle" | "success" | "guard" | "error";
  summary: {
    title: string;
    items: string[];
  };
  reviewSummary: {
    pendingCount: number;
    confirmedCount: number;
    needsFixCount: number;
  };
  executionSteps: StudioResultStep[];
  warningItems: string[];
  uncertainties: ChatStudioUncertaintyItem[];
  nextActions: StudioResultAction[];
}

export const toStudioResultViewModel = (
  message: ChatMessage | null | undefined
): StudioResultViewModel => {
  if (!message || message.role !== "assistant") {
    return {
      status: "idle",
      summary: {
        title: "图形摘要",
        items: ["暂无生成结果"]
      },
      reviewSummary: {
        pendingCount: 0,
        confirmedCount: 0,
        needsFixCount: 0
      },
      executionSteps: [],
      warningItems: [],
      uncertainties: [],
      nextActions: resolveProofAssistActions(message)
    };
  }

  const summaryItems =
    message.result?.summaryItems.length && message.result.summaryItems.length > 0
      ? message.result.summaryItems
      : message.content
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
  const uncertainties =
    message.result?.uncertaintyItems.length
      ? message.result.uncertaintyItems
      : message.result?.uncertaintyItems ?? [];
  const reviewSummary = uncertainties.reduce(
    (acc, item) => {
      if (item.reviewStatus === "confirmed") {
        acc.confirmedCount += 1;
      } else if (item.reviewStatus === "needs_fix") {
        acc.needsFixCount += 1;
      } else {
        acc.pendingCount += 1;
      }

      return acc;
    },
    {
      pendingCount: 0,
      confirmedCount: 0,
      needsFixCount: 0
    }
  );

  return {
    status: message.result?.status ?? "idle",
    summary: {
      title: "图形摘要",
      items: summaryItems.length > 0 ? summaryItems : ["暂无生成结果"]
    },
    reviewSummary,
    executionSteps: Array.isArray(message.agentSteps)
      ? message.agentSteps.map((step) => ({
          label: step.name,
          status: step.status,
          durationMs: step.duration_ms
        }))
      : [],
    warningItems: message.result?.warningItems ?? [],
    uncertainties,
    nextActions: resolveProofAssistActions(message)
  };
};
