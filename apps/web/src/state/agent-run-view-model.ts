import type { AgentRunEnvelope } from "@geohelper/protocol";

export interface AgentRunPanelStage {
  label: string;
  status: string;
  durationMs: number;
}

export interface AgentRunPanelReview {
  reviewer: string;
  verdict: string;
  summary: string[];
}

export interface AgentRunPanelViewModel {
  runId: string;
  modeLabel: string;
  statusLabel: string;
  iterationLabel: string;
  upstreamCallLabel: string;
  degraded: boolean;
  preflightLabel: string;
  referencedLabels: string[];
  generatedLabels: string[];
  reviews: AgentRunPanelReview[];
  stages: AgentRunPanelStage[];
}

const toStatusLabel = (status: AgentRunEnvelope["run"]["status"]): string => {
  if (status === "needs_review") {
    return "需要老师复核";
  }
  if (status === "degraded") {
    return "降级交付";
  }
  if (status === "failed") {
    return "生成失败";
  }

  return "可继续执行";
};

export const toAgentRunPanelViewModel = (
  agentRun: AgentRunEnvelope
): AgentRunPanelViewModel => ({
  runId: agentRun.run.id,
  modeLabel: agentRun.run.mode === "official" ? "Official" : "BYOK",
  statusLabel: toStatusLabel(agentRun.run.status),
  iterationLabel: `${agentRun.run.iterationCount} 次迭代`,
  upstreamCallLabel: `${agentRun.telemetry.upstreamCallCount} 次上游调用`,
  degraded: agentRun.telemetry.degraded,
  preflightLabel: `preflight ${agentRun.evidence.preflight.status}`,
  referencedLabels: agentRun.evidence.preflight.referencedLabels,
  generatedLabels: agentRun.evidence.preflight.generatedLabels,
  reviews: agentRun.reviews.map((review) => ({
    reviewer: review.reviewer,
    verdict: review.verdict,
    summary: review.summary
  })),
  stages: agentRun.telemetry.stages.map((stage) => ({
    label: stage.name,
    status: stage.status,
    durationMs: stage.durationMs
  }))
});
