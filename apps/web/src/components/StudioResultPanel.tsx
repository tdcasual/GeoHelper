import type { ChatMessage } from "../state/chat-store";
import { toStudioResultViewModel } from "./studio-result-panel";

interface StudioResultPanelProps {
  message: ChatMessage | null;
  onAction?: (prompt: string) => void | Promise<void>;
}

export const StudioResultPanel = ({
  message,
  onAction
}: StudioResultPanelProps) => {
  const viewModel = toStudioResultViewModel(message);

  return (
    <section className="studio-result-panel" data-testid="studio-result-panel">
      <section className="studio-result-section">
        <h3>图形摘要</h3>
        <ul>
          {viewModel.summary.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="studio-result-section">
        <h3>执行步骤</h3>
        {viewModel.executionSteps.length > 0 ? (
          <ul>
            {viewModel.executionSteps.map((step) => (
              <li key={`${step.label}_${step.durationMs}`}>
                <span>{step.label}</span>
                <span>{step.status}</span>
                <span>{step.durationMs}ms</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>暂无结构化执行步骤</p>
        )}
      </section>

      {viewModel.uncertainties.length > 0 ? (
        <section className="studio-result-section">
          <h3>待确认</h3>
          <ul>
            {viewModel.uncertainties.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="studio-result-section">
        <h3>下一步动作</h3>
        <div className="studio-result-actions">
          {viewModel.nextActions.map((action) => (
            <button
              key={action.id}
              type="button"
              data-testid={`proof-assist-action-${action.id}`}
              disabled={action.disabled}
              title={action.reason}
              onClick={() => {
                if (!action.disabled && action.prompt) {
                  void onAction?.(action.prompt);
                }
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>
    </section>
  );
};
