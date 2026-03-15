import type { ChatMessage } from "../state/chat-store";

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

export const resolveProofAssistActions = (
  message: ChatMessage | null | undefined
): ProofAssistAction[] => {
  if (!message || message.role !== "assistant") {
    return ACTION_LABELS.map((item) => ({
      ...item,
      prompt: "",
      disabled: true,
      reason: DISABLED_REASON
    }));
  }

  const lines = message.content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const uncertainties = lines
    .filter((line) => line.startsWith("待确认："))
    .map((line) => line.replace("待确认：", "").trim());
  const summaryLines = lines.filter((line) => !line.startsWith("待确认："));
  const summary = summaryLines.join("；");
  const hasContext =
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
