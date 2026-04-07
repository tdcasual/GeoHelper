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
  currentConversationTitle: string;
  recentConversations: Array<{
    id: string;
    title: string;
    updatedAt: number;
    isActive: boolean;
  }>;
  recentTemplates: ComponentProps<typeof TeacherTemplateLibrary>["templates"];
  onContinueCurrent: () => void;
  onSelectConversation: (conversationId: string) => void;
  onApplyContinueTemplate: (prompt: string) => void;
  onOpenTemplateLibrary: () => void;
  chatHeaderProps: ComponentProps<typeof WorkspaceChatHeader>;
  chatComposerProps: ComponentProps<typeof WorkspaceChatComposer>;
  canvasMountKey: string;
  canvasProfile: ComponentProps<typeof CanvasPanel>["profile"];
  canvasVisible: boolean;
  canvasFocusNotice?: ComponentProps<typeof CanvasPanel>["focusNotice"];
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
  currentConversationTitle,
  recentConversations,
  recentTemplates,
  onContinueCurrent,
  onSelectConversation,
  onApplyContinueTemplate,
  onOpenTemplateLibrary,
  chatHeaderProps,
  chatComposerProps,
  canvasMountKey,
  canvasProfile,
  canvasVisible,
  canvasFocusNotice,
  latestAssistantMessage,
  onStudioResultAction,
  onRetryLatestPrompt,
  onConfirmLatestUncertainty,
  onRepairLatestUncertainty,
  onFocusLatestUncertainty,
  activeFocusUncertaintyId,
  chatMessagesProps
}: WorkspaceDesktopLayoutProps) => (
  <>
    <CanvasPanel
      key={canvasMountKey}
      profile={canvasProfile}
      visible={canvasVisible}
      focusNotice={canvasFocusNotice}
    />
    <ChatPanel visible={chatVisible}>
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
        <section className="workspace-dialog-rail" data-testid="workspace-dialog-rail">
          <div className="workspace-dialog-intake">
            <TeacherTemplateLibrary
              open={templateLibraryOpen}
              templates={templateLibraryTemplates}
              onApply={onApplyTemplateLibrary}
              onClose={onCloseTemplateLibrary}
            />
            <StudioInputPanel
              mode={desktopInputMode}
              onModeChange={onDesktopInputModeChange}
              currentConversationTitle={currentConversationTitle}
              recentConversations={recentConversations}
              recentTemplates={recentTemplates}
              onContinueCurrent={onContinueCurrent}
              onSelectConversation={onSelectConversation}
              onApplyTemplate={onApplyContinueTemplate}
              onOpenTemplateLibrary={onOpenTemplateLibrary}
              headerSlot={<WorkspaceChatHeader {...chatHeaderProps} />}
              composerSlot={null}
            />
          </div>
          <div className="workspace-dialog-thread">
            <WorkspaceChatMessages {...chatMessagesProps} />
          </div>
          <div className="workspace-dialog-result-shell">
            <div className="workspace-dialog-result-header">
              <h3>最新执行</h3>
              <span>当前回合的结果摘要、待确认项与下一步动作。</span>
            </div>
            <StudioResultPanel
              message={latestAssistantMessage}
              onAction={onStudioResultAction}
              onRetry={onRetryLatestPrompt}
              onConfirmUncertainty={onConfirmLatestUncertainty}
              onRepairUncertainty={onRepairLatestUncertainty}
              onFocusUncertainty={onFocusLatestUncertainty}
              activeUncertaintyId={activeFocusUncertaintyId}
            />
          </div>
          <div className="workspace-dialog-composer">
            <WorkspaceChatComposer {...chatComposerProps} />
          </div>
        </section>
      </div>
    </ChatPanel>
  </>
);
