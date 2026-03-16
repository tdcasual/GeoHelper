import type { ComponentProps, RefObject } from "react";

import { CanvasPanel } from "../CanvasPanel";
import { ChatPanel } from "../ChatPanel";
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
  canvasMountKey: string;
  canvasProfile: ComponentProps<typeof CanvasPanel>["profile"];
  canvasVisible: boolean;
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
  canvasMountKey,
  canvasProfile,
  canvasVisible
}: WorkspaceCompactLayoutProps) => (
  <>
    <CanvasPanel
      key={canvasMountKey}
      profile={canvasProfile}
      visible={canvasVisible}
    />
    <ChatPanel visible={chatVisible}>
      <div ref={chatShellRef} className="chat-shell">
        <div className="chat-body">
          <WorkspaceChatHeader {...chatHeaderProps} />
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
