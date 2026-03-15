import type { ConversationThread } from "../../state/chat-store";

interface WorkspaceConversationSidebarProps {
  conversations: ConversationThread[];
  activeConversationId: string | null;
  onCreateConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
}

export const WorkspaceConversationSidebar = ({
  conversations,
  activeConversationId,
  onCreateConversation,
  onSelectConversation
}: WorkspaceConversationSidebarProps) => (
  <>
    <div className="conversation-sidebar-header">
      <button
        type="button"
        className="new-conversation-button"
        onClick={onCreateConversation}
      >
        新建会话
      </button>
    </div>
    <div className="conversation-list">
      {conversations.map((conversation) => (
        <button
          key={conversation.id}
          type="button"
          data-testid="conversation-item"
          className={`conversation-item${
            conversation.id === activeConversationId
              ? " conversation-item-active"
              : ""
          }`}
          onClick={() => onSelectConversation(conversation.id)}
        >
          <span className="conversation-item-title">{conversation.title}</span>
          <span className="conversation-item-meta">
            {new Date(conversation.updatedAt).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit"
            })}
          </span>
        </button>
      ))}
    </div>
  </>
);
