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
  summary: {
    title: string;
    items: string[];
  };
  executionSteps: StudioResultStep[];
  uncertainties: string[];
  nextActions: StudioResultAction[];
}

export const toStudioResultViewModel = (
  message: ChatMessage | null | undefined
): StudioResultViewModel => {
  if (!message || message.role !== "assistant") {
    return {
      summary: {
        title: "图形摘要",
        items: ["暂无生成结果"]
      },
      executionSteps: [],
      uncertainties: [],
      nextActions: resolveProofAssistActions(message)
    };
  }

  const lines = message.content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const uncertainties = lines
    .filter((line) => line.startsWith("待确认："))
    .map((line) => line.replace("待确认：", "").trim());
  const summaryItems = lines.filter((line) => !line.startsWith("待确认："));

  return {
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
    uncertainties,
    nextActions: resolveProofAssistActions(message)
  };
};
