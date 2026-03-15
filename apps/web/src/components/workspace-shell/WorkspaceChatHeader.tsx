interface WorkspaceChatHeaderProps {
  title: string;
  sceneTransactionCount: number;
  historyOpen: boolean;
  onToggleHistory: () => void;
}

export const WorkspaceChatHeader = ({
  title,
  sceneTransactionCount,
  historyOpen,
  onToggleHistory
}: WorkspaceChatHeaderProps) => (
  <div className="chat-thread-header">
    <h3>{title}</h3>
    <div className="chat-thread-actions">
      <span className="scene-transaction-count">事务数: {sceneTransactionCount}</span>
      <button
        type="button"
        className="history-toggle-button"
        data-testid="history-toggle-button"
        onClick={onToggleHistory}
      >
        {historyOpen ? "收起历史" : "历史"}
      </button>
    </div>
  </div>
);
