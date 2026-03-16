import type {
  ComponentProps,
  CSSProperties,
  PointerEventHandler,
  RefObject
} from "react";

import type { StudioStartMode } from "../../state/studio-start";
import { CanvasPanel } from "../CanvasPanel";
import { ChatPanel } from "../ChatPanel";
import { StudioInputPanel } from "../StudioInputPanel";
import { StudioResultPanel } from "../StudioResultPanel";
import { TeacherTemplateLibrary } from "../TeacherTemplateLibrary";
import { WorkspaceChatComposer } from "./WorkspaceChatComposer";
import { WorkspaceChatHeader } from "./WorkspaceChatHeader";
import { WorkspaceChatMessages } from "./WorkspaceChatMessages";
import { WorkspaceConversationSidebar } from "./WorkspaceConversationSidebar";

interface WorkspaceDesktopLayoutProps {
  chatVisible: boolean;
  chatShellRef: RefObject<HTMLDivElement | null>;
  desktopHistoryOverlay: boolean;
  historyDrawerVisible: boolean;
  historyDrawerStyle: CSSProperties;
  onHistoryResizeStart: PointerEventHandler<HTMLDivElement>;
  conversationSidebarProps: ComponentProps<typeof WorkspaceConversationSidebar>;
  templateLibraryOpen: boolean;
  templateLibraryTemplates: ComponentProps<typeof TeacherTemplateLibrary>["templates"];
  onApplyTemplateLibrary: (prompt: string) => void;
  onCloseTemplateLibrary: () => void;
  desktopInputMode: StudioStartMode;
  onDesktopInputModeChange: (mode: StudioStartMode) => void;
  conversationCount: number;
  templateCount: number;
  onOpenTemplateLibrary: () => void;
  chatHeaderProps: ComponentProps<typeof WorkspaceChatHeader>;
  chatComposerProps: ComponentProps<typeof WorkspaceChatComposer>;
  canvasMountKey: string;
  canvasProfile: ComponentProps<typeof CanvasPanel>["profile"];
  canvasVisible: boolean;
  latestAssistantMessage: ComponentProps<typeof StudioResultPanel>["message"];
  onStudioResultAction: ComponentProps<typeof StudioResultPanel>["onAction"];
  chatMessagesProps: ComponentProps<typeof WorkspaceChatMessages>;
}

export const WorkspaceDesktopLayout = ({
  chatVisible,
  chatShellRef,
  desktopHistoryOverlay,
  historyDrawerVisible,
  historyDrawerStyle,
  onHistoryResizeStart,
  conversationSidebarProps,
  templateLibraryOpen,
  templateLibraryTemplates,
  onApplyTemplateLibrary,
  onCloseTemplateLibrary,
  desktopInputMode,
  onDesktopInputModeChange,
  conversationCount,
  templateCount,
  onOpenTemplateLibrary,
  chatHeaderProps,
  chatComposerProps,
  canvasMountKey,
  canvasProfile,
  canvasVisible,
  latestAssistantMessage,
  onStudioResultAction,
  chatMessagesProps
}: WorkspaceDesktopLayoutProps) => (
  <>
    <aside
      className="studio-input-rail"
      data-testid="studio-input-rail"
      hidden={!chatVisible}
    >
      <div
        ref={chatShellRef}
        className={`chat-shell${desktopHistoryOverlay ? " history-overlay-mode" : ""}`}
      >
        <div
          className={`history-drawer${historyDrawerVisible ? " history-drawer-open" : ""}`}
          style={historyDrawerStyle}
        >
          {historyDrawerVisible ? (
            <aside className="conversation-sidebar" data-testid="conversation-sidebar">
              <WorkspaceConversationSidebar {...conversationSidebarProps} />
            </aside>
          ) : null}
          <div
            className="history-resizer"
            data-testid="history-resizer"
            hidden={!historyDrawerVisible}
            onPointerDown={onHistoryResizeStart}
          />
        </div>
        <div className="chat-body studio-input-body">
          <TeacherTemplateLibrary
            open={templateLibraryOpen}
            templates={templateLibraryTemplates}
            onApply={onApplyTemplateLibrary}
            onClose={onCloseTemplateLibrary}
          />
          <StudioInputPanel
            mode={desktopInputMode}
            onModeChange={onDesktopInputModeChange}
            conversationCount={conversationCount}
            templateCount={templateCount}
            onOpenTemplateLibrary={onOpenTemplateLibrary}
            headerSlot={<WorkspaceChatHeader {...chatHeaderProps} />}
            composerSlot={<WorkspaceChatComposer {...chatComposerProps} />}
          />
        </div>
      </div>
    </aside>
    <CanvasPanel
      key={canvasMountKey}
      profile={canvasProfile}
      visible={canvasVisible}
    />
    <ChatPanel visible={chatVisible}>
      <div className="studio-result-rail" data-testid="studio-result-rail">
        <div className="studio-result-rail-header">
          <h3>生成结果</h3>
          <span>最新会话输出与执行回执</span>
        </div>
        <StudioResultPanel
          message={latestAssistantMessage}
          onAction={onStudioResultAction}
        />
        <WorkspaceChatMessages {...chatMessagesProps} />
      </div>
    </ChatPanel>
  </>
);
