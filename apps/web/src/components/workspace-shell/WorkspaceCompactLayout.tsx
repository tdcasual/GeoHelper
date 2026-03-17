import type { ComponentProps, RefObject } from "react";

import { CanvasPanel } from "../CanvasPanel";
import { ChatPanel } from "../ChatPanel";
import { StudioContinuePanel } from "../StudioContinuePanel";
import { StudioResultPanel } from "../StudioResultPanel";
import { WorkspaceChatComposer } from "./WorkspaceChatComposer";
import { WorkspaceChatHeader } from "./WorkspaceChatHeader";
import { WorkspaceChatMessages } from "./WorkspaceChatMessages";
import { WorkspaceConversationSidebar } from "./WorkspaceConversationSidebar";

interface WorkspaceCompactLayoutProps {
  chatVisible: boolean;
  chatShellRef: RefObject<HTMLDivElement | null>;
  chatHeaderProps: ComponentProps<typeof WorkspaceChatHeader>;
  chatMessagesProps: ComponentProps<typeof WorkspaceChatMessages>;
  chatComposerProps: ComponentProps<typeof WorkspaceChatComposer>;
  compactHistorySheetVisible: boolean;
  onCloseHistorySheet: () => void;
  conversationSidebarProps: ComponentProps<typeof WorkspaceConversationSidebar>;
  currentConversationTitle: string;
  recentConversations: Array<{
    id: string;
    title: string;
    updatedAt: number;
    isActive: boolean;
  }>;
  recentTemplates: Array<{
    id: string;
    title: string;
    prompt: string;
    category: string;
    updatedAt: number;
  }>;
  onContinueCurrent: () => void;
  onSelectConversation: (conversationId: string) => void;
  onApplyTemplate: (prompt: string) => void;
  onOpenTemplateLibrary: () => void;
  latestAssistantMessage: ComponentProps<typeof StudioResultPanel>["message"];
  onStudioResultAction: ComponentProps<typeof StudioResultPanel>["onAction"];
  onRetryLatestPrompt: ComponentProps<typeof StudioResultPanel>["onRetry"];
  onConfirmLatestUncertainty: ComponentProps<
    typeof StudioResultPanel
  >["onConfirmUncertainty"];
  onRepairLatestUncertainty: ComponentProps<
    typeof StudioResultPanel
  >["onRepairUncertainty"];
  onFocusLatestUncertainty: ComponentProps<
    typeof StudioResultPanel
  >["onFocusUncertainty"];
  activeFocusUncertaintyId?: ComponentProps<
    typeof StudioResultPanel
  >["activeUncertaintyId"];
  canvasMountKey: string;
  canvasProfile: ComponentProps<typeof CanvasPanel>["profile"];
  canvasVisible: boolean;
  canvasFocusNotice?: ComponentProps<typeof CanvasPanel>["focusNotice"];
}

export const WorkspaceCompactLayout = ({
  chatVisible,
  chatShellRef,
  chatHeaderProps,
  chatMessagesProps,
  chatComposerProps,
  compactHistorySheetVisible,
  onCloseHistorySheet,
  conversationSidebarProps,
  currentConversationTitle,
  recentConversations,
  recentTemplates,
  onContinueCurrent,
  onSelectConversation,
  onApplyTemplate,
  onOpenTemplateLibrary,
  latestAssistantMessage,
  onStudioResultAction,
  onRetryLatestPrompt,
  onConfirmLatestUncertainty,
  onRepairLatestUncertainty,
  onFocusLatestUncertainty,
  activeFocusUncertaintyId,
  canvasMountKey,
  canvasProfile,
  canvasVisible,
  canvasFocusNotice
}: WorkspaceCompactLayoutProps) => (
  <>
    <CanvasPanel
      key={canvasMountKey}
      profile={canvasProfile}
      visible={canvasVisible}
      focusNotice={canvasFocusNotice}
    />
    <ChatPanel visible={chatVisible}>
      <div ref={chatShellRef} className="chat-shell">
        <div className="chat-body">
          <WorkspaceChatHeader {...chatHeaderProps} />
          {chatMessagesProps.messages.length === 0 ? (
            <StudioContinuePanel
              currentConversationTitle={currentConversationTitle}
              recentConversations={recentConversations}
              recentTemplates={recentTemplates}
              onContinueCurrent={onContinueCurrent}
              onSelectConversation={onSelectConversation}
              onApplyTemplate={onApplyTemplate}
              onOpenTemplateLibrary={onOpenTemplateLibrary}
            />
          ) : null}
          {latestAssistantMessage ? (
            <StudioResultPanel
              message={latestAssistantMessage}
              onAction={onStudioResultAction}
              onRetry={onRetryLatestPrompt}
              onConfirmUncertainty={onConfirmLatestUncertainty}
              onRepairUncertainty={onRepairLatestUncertainty}
              onFocusUncertainty={onFocusLatestUncertainty}
              activeUncertaintyId={activeFocusUncertaintyId}
            />
          ) : null}
          <WorkspaceChatMessages {...chatMessagesProps} />
          <WorkspaceChatComposer {...chatComposerProps} />
        </div>
        {compactHistorySheetVisible ? (
          <div
            className="history-sheet-backdrop"
            data-testid="history-sheet-backdrop"
            onClick={onCloseHistorySheet}
          >
            <div
              className="history-sheet"
              data-testid="history-sheet"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="history-sheet-handle" />
              <aside className="conversation-sidebar" data-testid="conversation-sidebar">
                <WorkspaceConversationSidebar {...conversationSidebarProps} />
              </aside>
            </div>
          </div>
        ) : null}
      </div>
    </ChatPanel>
  </>
);
