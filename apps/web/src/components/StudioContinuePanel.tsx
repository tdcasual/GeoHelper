import type { PromptTemplate } from "../state/template-store";

interface StudioContinueConversationItem {
  id: string;
  title: string;
  updatedAt: number;
  isActive: boolean;
}

interface StudioContinuePanelProps {
  currentConversationTitle: string;
  recentConversations: StudioContinueConversationItem[];
  recentTemplates: PromptTemplate[];
  onContinueCurrent: () => void;
  onSelectConversation: (conversationId: string) => void;
  onApplyTemplate: (prompt: string) => void;
  onOpenTemplateLibrary: () => void;
}

const formatUpdatedAt = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return "";
  }
};

export const StudioContinuePanel = ({
  currentConversationTitle,
  recentConversations,
  recentTemplates,
  onContinueCurrent,
  onSelectConversation,
  onApplyTemplate,
  onOpenTemplateLibrary
}: StudioContinuePanelProps) => (
  <section className="studio-continue-panel" data-testid="studio-continue-panel">
    <div className="studio-continue-primary">
      <strong>继续当前画稿</strong>
      <p>{currentConversationTitle || "新会话"}</p>
      <button type="button" onClick={onContinueCurrent}>
        继续当前画稿
      </button>
    </div>

    <div className="studio-continue-grid">
      <section className="studio-continue-section">
        <h4>最近图稿</h4>
        <div className="studio-continue-items">
          {recentConversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className="studio-continue-item"
              data-testid="studio-recent-conversation"
              onClick={() => onSelectConversation(conversation.id)}
            >
              <span>{conversation.title}</span>
              <small>
                {conversation.isActive ? "当前会话" : formatUpdatedAt(conversation.updatedAt)}
              </small>
            </button>
          ))}
        </div>
      </section>

      <section className="studio-continue-section">
        <h4>常用模板</h4>
        <div className="studio-continue-items">
          {recentTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              className="studio-continue-item"
              data-testid="studio-recent-template"
              onClick={() => onApplyTemplate(template.prompt)}
            >
              <span>{template.title}</span>
              <small>{template.category}</small>
            </button>
          ))}
        </div>
        <button type="button" onClick={onOpenTemplateLibrary}>
          打开模板库
        </button>
      </section>
    </div>
  </section>
);
