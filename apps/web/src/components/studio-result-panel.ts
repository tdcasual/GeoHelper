import type { ChatMessage } from "../state/chat-store";
import type { ChatStudioUncertaintyItem } from "../state/chat-result";
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

  return {
    status: message.result?.status ?? "idle",
    summary: {
      title: "图形摘要",
      items: summaryItems.length > 0 ? summaryItems : ["暂无生成结果"]
    },
    executionSteps: Array.isArray(message.agentSteps)
      ? message.agentSteps.map((step) => ({
          label: step.name,
          status: step.status,
          durationMs: step.duration_ms
        }))
      : [],
    warningItems: message.result?.warningItems ?? [],
    uncertainties: message.result?.uncertaintyItems ?? [],
    nextActions: resolveProofAssistActions(message)
  };
};
