import type { AgentRunEnvelope } from "@geohelper/protocol";

import { toAgentRunPanelViewModel } from "../state/agent-run-view-model";

interface AgentRunPanelProps {
  agentRun: AgentRunEnvelope | null | undefined;
}

export const AgentRunPanel = ({ agentRun }: AgentRunPanelProps) => {
  if (!agentRun) {
    return null;
  }

  const viewModel = toAgentRunPanelViewModel(agentRun);

  return (
    <section className="agent-run-panel" data-testid="agent-run-panel">
      <section className="studio-result-section">
        <h3>Agent Run</h3>
        <p>{viewModel.runId}</p>
        <p>
          {viewModel.modeLabel} · {viewModel.statusLabel}
        </p>
        <p>
          {viewModel.iterationLabel} · {viewModel.upstreamCallLabel}
        </p>
        <p>{viewModel.preflightLabel}</p>
        {viewModel.degraded ? <p>本轮以降级模式交付</p> : null}
      </section>

      <section className="studio-result-section">
        <h3>审查记录</h3>
        {viewModel.reviews.length > 0 ? (
          <ul>
            {viewModel.reviews.map((review, index) => (
              <li key={`${review.reviewer}_${index}`}>
                <span>{review.reviewer}</span>
                <span>{review.verdict}</span>
                {review.summary.length > 0 ? (
                  <span>{review.summary.join("；")}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>暂无独立审查记录</p>
        )}
      </section>

      <section className="studio-result-section">
        <h3>Preflight 证据</h3>
        <p>引用对象：{viewModel.referencedLabels.join(", ") || "无"}</p>
        <p>生成对象：{viewModel.generatedLabels.join(", ") || "无"}</p>
      </section>

      <section className="studio-result-section">
        <h3>阶段时间线</h3>
        {viewModel.stages.length > 0 ? (
          <ul>
            {viewModel.stages.map((stage) => (
              <li key={`${stage.label}_${stage.durationMs}`}>
                <span>{stage.label}</span>
                <span>{stage.status}</span>
                <span>{stage.durationMs}ms</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>暂无阶段时间线</p>
        )}
      </section>
    </section>
  );
};
