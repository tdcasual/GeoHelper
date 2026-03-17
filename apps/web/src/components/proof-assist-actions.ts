import type {
  AgentRunEnvelope,
  GeometryCanvasEvidence
} from "@geohelper/protocol";

import type { ChatMessage } from "../state/chat-store";
import type {
  ChatStudioResult,
  ChatStudioUncertaintyItem
} from "../state/chat-result";

export type ProofAssistActionId =
  | "add_auxiliary"
  | "generate_explanation"
  | "attempt_proof";

export interface ProofAssistAction {
  id: ProofAssistActionId;
  label: string;
  prompt: string;
  disabled: boolean;
  reason?: string;
}

const DISABLED_REASON = "请先生成图形结果，再使用证明辅助动作。";

const ACTION_LABELS: Array<{
  id: ProofAssistActionId;
  label: string;
}> = [
  { id: "add_auxiliary", label: "补辅助线" },
  { id: "generate_explanation", label: "生成讲解思路" },
  { id: "attempt_proof", label: "尝试证明" }
];

const buildPrompt = (
  actionId: ProofAssistActionId,
  summary: string,
  uncertainties: string[]
): string => {
  const uncertaintySuffix =
    uncertainties.length > 0
      ? `\n待确认条件：${uncertainties.join("；")}`
      : "";

  if (actionId === "add_auxiliary") {
    return `基于当前图形结果，请补充为了讲题更清晰的辅助线，并说明每条辅助线的作用。\n当前结果：${summary}${uncertaintySuffix}`;
  }

  if (actionId === "generate_explanation") {
    return `基于当前图形结果，请生成适合中学课堂讲解的解题思路，按课堂讲述顺序分步骤说明。\n当前结果：${summary}${uncertaintySuffix}`;
  }

  return `基于当前图形结果，请尝试给出证明思路或证明草稿，并标出仍需确认的条件。\n当前结果：${summary}${uncertaintySuffix}`;
};

const buildRepairPrompt = (
  summary: string,
  uncertainty: ChatStudioUncertaintyItem
): string =>
  `请基于当前图形结果，仅针对这一项待确认条件完成核对与修正：${uncertainty.label}\n当前结果：${summary}\n检查要求：${uncertainty.followUpPrompt}`;

export const resolveUncertaintyRepairPrompt = (
  message: ChatMessage | null | undefined,
  uncertaintyId: string,
  options?: {
    agentRun?: AgentRunEnvelope | null;
    canvasEvidence?: GeometryCanvasEvidence | null;
  }
): string | null => {
  const result: ChatStudioResult | undefined =
    message?.role === "assistant" ? message.result : undefined;
  if (!result || result.status !== "success") {
    return null;
  }

  const summary = result.summaryItems.join("；");
  if (!summary) {
    return null;
  }

  const uncertainty = result.uncertaintyItems.find(
    (item) => item.id === uncertaintyId
  );
  if (!uncertainty) {
    return null;
  }

  const draftSuffix = options?.agentRun
    ? `\n当前草案：${options.agentRun.draft.normalizedIntent}`
    : "";
  const canvasEvidenceSuffix = options?.canvasEvidence
    ? `\n画布证据：已执行 ${options.canvasEvidence.executedCommandCount} 条指令；可见对象：${options.canvasEvidence.visibleLabels.join(
        "、"
      )}${options.canvasEvidence.teacherFocus ? `；教师关注：${options.canvasEvidence.teacherFocus}` : ""}`
    : "";

  return `${buildRepairPrompt(summary, uncertainty)}${draftSuffix}${canvasEvidenceSuffix}`;
};

export const resolveProofAssistActions = (
  message: ChatMessage | null | undefined
): ProofAssistAction[] => {
  const result: ChatStudioResult | undefined =
    message?.role === "assistant" ? message.result : undefined;

  if (!message || message.role !== "assistant" || !result) {
    return ACTION_LABELS.map((item) => ({
      ...item,
      prompt: "",
      disabled: true,
      reason: DISABLED_REASON
    }));
  }

  const summary = result.summaryItems.join("；");
  const uncertainties = result.uncertaintyItems.map((item) => item.label);
  const hasContext =
    result.status === "success" &&
    summary.length > 0 &&
    summary !== "暂无生成结果" &&
    !summary.includes("生成失败");

  return ACTION_LABELS.map((item) => ({
    ...item,
    prompt: hasContext ? buildPrompt(item.id, summary, uncertainties) : "",
    disabled: !hasContext,
    reason: hasContext ? undefined : DISABLED_REASON
  }));
};
