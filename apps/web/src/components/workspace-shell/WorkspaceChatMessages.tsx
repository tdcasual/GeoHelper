import type { ChatMode } from "../../runtime/types";
import type { ChatMessage } from "../../state/chat-store";
import type { PromptTemplate } from "../../state/template-store";

interface WorkspaceChatMessagesProps {
  messages: ChatMessage[];
  compactViewport: boolean;
  compactEmptyStateTemplates: PromptTemplate[];
  templates: PromptTemplate[];
  showAgentSteps: boolean;
  mode: ChatMode;
  sessionToken: string | null;
  onApplyTemplate: (prompt: string) => void;
}

export const WorkspaceChatMessages = ({
  messages,
  compactViewport,
  compactEmptyStateTemplates,
  templates,
  showAgentSteps,
  mode,
  sessionToken,
  onApplyTemplate
}: WorkspaceChatMessagesProps) => (
  <div className="chat-messages">
    {messages.length === 0 ? (
      !compactViewport ? (
        <div className="chat-empty-state">
          <section className="chat-empty-card" data-testid="chat-empty-card">
            <div className="chat-empty-copy">
              <h4>开始输入你的几何需求</h4>
              <p>也可以先试试这些模板，快速生成一个可编辑的起点。</p>
            </div>
            <div className="chat-empty-actions">
              {templates.slice(0, 3).map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="chat-empty-template-button"
                  data-testid="chat-empty-template-button"
                  onClick={() => onApplyTemplate(template.prompt)}
                >
                  {template.title}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="chat-empty chat-empty-compact" data-testid="chat-empty-compact">
          <p>开始输入你的几何需求</p>
          <div className="chat-empty-actions chat-empty-actions-compact">
            {compactEmptyStateTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                className="chat-empty-template-button"
                data-testid="chat-empty-template-button"
                onClick={() => onApplyTemplate(template.prompt)}
              >
                {template.title}
              </button>
            ))}
          </div>
        </div>
      )
    ) : (
      messages.map((message) => (
        <article key={message.id} className={`chat-message chat-message-${message.role}`}>
          {message.attachments && message.attachments.length > 0 ? (
            <div className="chat-message-attachments">
              {message.attachments.map((attachment) => (
                <figure key={attachment.id} className="chat-message-attachment">
                  <img
                    src={attachment.previewUrl ?? attachment.transportPayload}
                    alt={attachment.name}
                  />
                  <figcaption>{attachment.name}</figcaption>
                </figure>
              ))}
            </div>
          ) : null}
          {message.content ? <div>{message.content}</div> : null}
          {showAgentSteps &&
          message.role === "assistant" &&
          message.agentSteps &&
          message.agentSteps.length > 0 ? (
            <section className="agent-steps" data-testid="agent-steps">
              <h4>执行步骤</h4>
              <ul>
                {message.agentSteps.map((step, index) => (
                  <li
                    key={`${message.id}_${step.name}_${index}`}
                    className={`agent-step agent-step-${step.status}`}
                  >
                    <span className="agent-step-name">{step.name}</span>
                    <span className="agent-step-status">{step.status}</span>
                    <span className="agent-step-time">{step.duration_ms}ms</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </article>
      ))
    )}
    {mode === "official" && !sessionToken ? (
      <div className="session-warning" data-testid="session-warning">
        官方模式未登录或会话已过期，请输入 Token
      </div>
    ) : null}
  </div>
);
