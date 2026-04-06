import type { ChatMessage } from "../state/chat-store";
import { toStudioResultViewModel } from "./studio-result-panel";

interface StudioResultPanelProps {
  message: ChatMessage | null;
  onAction?: (prompt: string) => void | Promise<void>;
  onRetry?: () => void | Promise<void>;
  onConfirmUncertainty?: (uncertaintyId: string) => void | Promise<void>;
  onRepairUncertainty?: (uncertaintyId: string) => void | Promise<void>;
  onFocusUncertainty?: (uncertaintyId: string) => void | Promise<void>;
  activeUncertaintyId?: string | null;
}

export const StudioResultPanel = ({
  message,
  onAction,
  onRetry,
  onConfirmUncertainty,
  onRepairUncertainty,
  onFocusUncertainty,
  activeUncertaintyId
}: StudioResultPanelProps) => {
  const viewModel = toStudioResultViewModel(message);
  const statusLabel =
    viewModel.status === "success"
      ? "可继续补图"
      : viewModel.status === "guard"
        ? "需要先处理运行时限制"
        : viewModel.status === "error"
          ? "本轮生成失败"
          : "等待生成";

  return (
    <section className="studio-result-panel" data-testid="studio-result-panel">
      <section className="studio-result-section">
        <h3>结果状态</h3>
        <p>{statusLabel}</p>
        {viewModel.status === "error" ? (
          <button
            type="button"
            className="studio-result-retry-button"
            onClick={() => {
              void onRetry?.();
            }}
          >
            重试当前请求
          </button>
        ) : null}
      </section>

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

      {viewModel.warningItems.length > 0 ? (
        <section className="studio-result-section">
          <h3>注意事项</h3>
          <ul>
            {viewModel.warningItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {viewModel.uncertainties.length > 0 ? (
        <section className="studio-result-section">
          <h3>待确认</h3>
          <p>
            待处理 {viewModel.reviewSummary.pendingCount} · 已确认{" "}
            {viewModel.reviewSummary.confirmedCount} · 需修正{" "}
            {viewModel.reviewSummary.needsFixCount}
          </p>
          <ul>
            {viewModel.uncertainties.map((item) => {
              const isActive = activeUncertaintyId === item.id;
              const reviewStateClass =
                item.reviewStatus === "confirmed"
                  ? " studio-review-item-confirmed"
                  : item.reviewStatus === "needs_fix"
                    ? " studio-review-item-needs-fix"
                    : "";

              return (
                <li
                  key={item.id}
                  className={`studio-review-item${
                    isActive ? " studio-review-item-active" : ""
                  }${reviewStateClass}`}
                  data-testid={`studio-uncertainty-${item.id}`}
                  data-focus-state={isActive ? "active" : "idle"}
                >
                  <div>
                    <span>{item.label}</span>
                    <span>
                      {item.reviewStatus === "confirmed"
                        ? "已确认"
                        : item.reviewStatus === "needs_fix"
                          ? "需修正"
                          : "待处理"}
                    </span>
                  </div>
                  <div>
                    <button
                      type="button"
                      data-testid={`studio-uncertainty-focus-${item.id}`}
                      disabled={!onFocusUncertainty}
                      onClick={() => {
                        void onFocusUncertainty?.(item.id);
                      }}
                    >
                      定位到画布
                    </button>
                    <button
                      type="button"
                      data-testid={`studio-uncertainty-confirm-${item.id}`}
                      disabled={
                        viewModel.status !== "success" ||
                        item.reviewStatus === "confirmed"
                      }
                      onClick={() => {
                        void onConfirmUncertainty?.(item.id);
                      }}
                    >
                      确认无误
                    </button>
                    <button
                      type="button"
                      data-testid={`studio-uncertainty-repair-${item.id}`}
                      disabled={viewModel.status !== "success"}
                      onClick={() => {
                        void onRepairUncertainty?.(item.id);
                      }}
                    >
                      需要修正
                    </button>
                  </div>
                </li>
              );
            })}
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
