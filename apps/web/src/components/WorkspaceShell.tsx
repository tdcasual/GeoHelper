import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";

import { useSceneStore } from "../state/scene-store";
import { useSettingsStore } from "../state/settings-store";
import { type StudioStartMode } from "../state/studio-start";
import { useUIStore } from "../state/ui-store";
import { CanvasPanel } from "./CanvasPanel";
import { ChatPanel } from "./ChatPanel";
import { SettingsDrawer } from "./SettingsDrawer";
import { StudioInputPanel } from "./StudioInputPanel";
import { StudioResultPanel } from "./StudioResultPanel";
import { TeacherTemplateLibrary } from "./TeacherTemplateLibrary";
import { TokenGateDialog } from "./TokenGateDialog";
import { useWorkspaceComposer } from "./workspace-shell/useWorkspaceComposer";
import { useWorkspaceRuntimeSession } from "./workspace-shell/useWorkspaceRuntimeSession";
import { WorkspaceChatComposer } from "./workspace-shell/WorkspaceChatComposer";
import { WorkspaceChatHeader } from "./workspace-shell/WorkspaceChatHeader";
import { WorkspaceChatMessages } from "./workspace-shell/WorkspaceChatMessages";
import { WorkspaceConversationSidebar } from "./workspace-shell/WorkspaceConversationSidebar";
import { WorkspaceTopBar } from "./workspace-shell/WorkspaceTopBar";

type MobileSurface = "canvas" | "chat";

interface WorkspaceShellProps {
  initialDesktopInputMode?: StudioStartMode;
  initialTemplateLibraryOpen?: boolean;
  onTemplateLibraryOpenChange?: (open: boolean) => void;
}

export const WorkspaceShell = ({
  initialDesktopInputMode = "image",
  initialTemplateLibraryOpen = false,
  onTemplateLibraryOpenChange
}: WorkspaceShellProps = {}) => {
  const chatVisible = useUIStore((state) => state.chatVisible);
  const historyDrawerVisible = useUIStore(
    (state) => state.historyDrawerVisible
  );
  const historyDrawerWidth = useUIStore((state) => state.historyDrawerWidth);
  const toggleChat = useUIStore((state) => state.toggleChat);
  const toggleHistoryDrawer = useUIStore((state) => state.toggleHistoryDrawer);
  const setHistoryDrawerWidth = useUIStore(
    (state) => state.setHistoryDrawerWidth
  );
  const sceneTransactionCount = useSceneStore(
    (state) => state.transactions.length
  );
  const isSceneRollingBack = useSceneStore((state) => state.isRollingBack);
  const rollbackLastScene = useSceneStore((state) => state.rollbackLast);
  const clearScene = useSceneStore((state) => state.clearScene);
  const settingsOpen = useSettingsStore((state) => state.drawerOpen);
  const setSettingsOpen = useSettingsStore((state) => state.setDrawerOpen);
  const showAgentSteps = useSettingsStore(
    (state) => state.experimentFlags.showAgentSteps
  );

  const chatShellRef = useRef<HTMLDivElement | null>(null);
  const composerFormRef = useRef<HTMLFormElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const mobileActionsButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileActionsMenuRef = useRef<HTMLDivElement | null>(null);
  const plusMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const plusMenuRef = useRef<HTMLDivElement | null>(null);

  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isShortViewport, setIsShortViewport] = useState(false);
  const [mobileSurface, setMobileSurface] = useState<MobileSurface>("canvas");
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [compactHistorySheetVisible, setCompactHistorySheetVisible] =
    useState(false);
  const [canvasFullscreenActive, setCanvasFullscreenActive] = useState(false);
  const [chatShellWidth, setChatShellWidth] = useState(0);
  const [desktopInputMode, setDesktopInputMode] =
    useState<StudioStartMode>(initialDesktopInputMode);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(
    initialTemplateLibraryOpen
  );

  const compactViewport = isCompactViewport;
  const phoneViewport = isMobileViewport;
  const shortViewport = isShortViewport;
  const canvasProfile = phoneViewport ? "mobile" : "desktop";
  const canvasViewportMode = !compactViewport
    ? "regular"
    : shortViewport
      ? "compact-short"
      : "compact";
  const rawCanvasMountKey = `${canvasProfile}-${canvasViewportMode}`;
  const [canvasMountKey, setCanvasMountKey] = useState(rawCanvasMountKey);

  const runtimeSession = useWorkspaceRuntimeSession({
    onOpenSettings: () => {
      setSettingsOpen(true);
      setMobileActionsOpen(false);
      if (compactViewport) {
        setCompactHistorySheetVisible(false);
      }
    }
  });

  const composer = useWorkspaceComposer({
    composerRef,
    mode: runtimeSession.mode,
    phoneViewport,
    runtimeBaseUrl: runtimeSession.runtimeBaseUrl,
    runtimeTarget: runtimeSession.runtimeTarget
  });

  const effectiveHistoryDrawerVisible = compactViewport
    ? compactHistorySheetVisible
    : historyDrawerVisible;
  const canvasVisible = !compactViewport || mobileSurface === "canvas";
  const effectiveChatVisible = compactViewport
    ? mobileSurface === "chat"
    : chatVisible;

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const syncFullscreenState = () => {
      setCanvasFullscreenActive(!!document.fullscreenElement);
    };

    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
    };
  }, []);

  useEffect(() => {
    if (!canvasFullscreenActive) {
      setCanvasMountKey(rawCanvasMountKey);
    }
  }, [canvasFullscreenActive, rawCanvasMountKey]);

  useEffect(() => {
    const syncViewport = () => {
      const short = window.innerHeight <= 500;
      const compact = window.innerWidth <= 900 || short;
      const phone = window.innerWidth <= 700;
      setIsCompactViewport(compact);
      setIsMobileViewport(phone);
      setIsShortViewport(short);
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
    };
  }, []);

  useEffect(() => {
    if (!compactViewport) {
      setMobileActionsOpen(false);
      setCompactHistorySheetVisible(false);
      return;
    }

    setMobileActionsOpen(false);
    setMobileSurface("canvas");
    setCompactHistorySheetVisible(false);
  }, [compactViewport]);

  useEffect(() => {
    if (
      compactViewport &&
      mobileSurface !== "chat" &&
      compactHistorySheetVisible
    ) {
      setCompactHistorySheetVisible(false);
    }
  }, [compactHistorySheetVisible, compactViewport, mobileSurface]);

  useEffect(() => {
    const node = chatShellRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 0;
      setChatShellWidth(nextWidth);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const minimumDesktopChatWidthForInlineHistory = 240;
  const minimumDesktopHistoryDrawerWidth = 220;
  const desktopHistoryOverlay =
    !compactViewport &&
    chatShellWidth > 0 &&
    chatShellWidth - Math.min(historyDrawerWidth, 420) <
      minimumDesktopChatWidthForInlineHistory;
  const desktopHistoryFullOverlay =
    desktopHistoryOverlay && chatShellWidth >= 520;
  const historyDrawerMaxWidth = useMemo(() => {
    if (chatShellWidth <= 0) {
      return 420;
    }

    if (!compactViewport && desktopHistoryOverlay) {
      return Math.max(240, Math.min(360, chatShellWidth - 24));
    }

    const proportionalMax = Math.floor(chatShellWidth * 0.45);
    const maxInlineWidth = Math.max(
      minimumDesktopHistoryDrawerWidth,
      chatShellWidth - minimumDesktopChatWidthForInlineHistory
    );
    return Math.min(
      420,
      Math.max(
        minimumDesktopHistoryDrawerWidth,
        Math.min(proportionalMax, maxInlineWidth)
      )
    );
  }, [
    chatShellWidth,
    compactViewport,
    desktopHistoryOverlay,
    minimumDesktopChatWidthForInlineHistory,
    minimumDesktopHistoryDrawerWidth
  ]);
  const computedHistoryDrawerWidth = Math.min(
    historyDrawerWidth,
    historyDrawerMaxWidth
  );
  const historyDrawerStyle = {
    width: historyDrawerVisible
      ? desktopHistoryFullOverlay
        ? "calc(100% - 20px)"
        : computedHistoryDrawerWidth
      : 0
  };

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (mobileActionsOpen) {
        const insideActionsMenu = mobileActionsMenuRef.current?.contains(target);
        const insideActionsButton = mobileActionsButtonRef.current?.contains(target);
        if (!insideActionsMenu && !insideActionsButton) {
          setMobileActionsOpen(false);
        }
      }

      if (composer.plusMenuOpen) {
        const insidePlusMenu = plusMenuRef.current?.contains(target);
        const insidePlusButton = plusMenuButtonRef.current?.contains(target);
        if (!insidePlusMenu && !insidePlusButton) {
          composer.setPlusMenuOpen(false);
        }
      }

      if (composer.slashMenuVisible) {
        const insideComposer = composerFormRef.current?.contains(target);
        if (!insideComposer) {
          composer.closeComposerMenus();
        }
      }
    };

    if (
      mobileActionsOpen ||
      composer.plusMenuOpen ||
      composer.slashMenuVisible
    ) {
      document.addEventListener("pointerdown", handlePointerDown);
    }

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [
    mobileActionsOpen,
    composer.closeComposerMenus,
    composer.plusMenuOpen,
    composer.setPlusMenuOpen,
    composer.slashMenuVisible
  ]);

  useEffect(() => {
    setDesktopInputMode(initialDesktopInputMode);
  }, [initialDesktopInputMode]);

  useEffect(() => {
    setTemplateLibraryOpen(initialTemplateLibraryOpen);
  }, [initialTemplateLibraryOpen]);

  useEffect(() => {
    onTemplateLibraryOpenChange?.(templateLibraryOpen);
  }, [onTemplateLibraryOpenChange, templateLibraryOpen]);

  const openSettingsDrawer = () => {
    setSettingsOpen(true);
    setMobileActionsOpen(false);
    composer.closeComposerMenus();
    if (compactViewport) {
      setCompactHistorySheetVisible(false);
    }
  };

  const handleHistoryResizeStart = (event: PointerEvent<HTMLDivElement>) => {
    if (!historyDrawerVisible || isMobileViewport || desktopHistoryOverlay) {
      return;
    }

    event.preventDefault();
    const startX = event.clientX;
    const startWidth = computedHistoryDrawerWidth;
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      setHistoryDrawerWidth(startWidth + delta);
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };

  const handleRollbackAction = () => {
    setMobileActionsOpen(false);
    composer.setPlusMenuOpen(false);
    void rollbackLastScene();
  };

  const handleClearSceneAction = () => {
    setMobileActionsOpen(false);
    composer.setPlusMenuOpen(false);
    void clearScene();
  };

  const handleLogoutAction = () => {
    setMobileActionsOpen(false);
    composer.setPlusMenuOpen(false);
    void runtimeSession.handleLogout();
  };

  const handleSelectMobileSurface = (surface: MobileSurface) => {
    setMobileSurface(surface);
    setMobileActionsOpen(false);
    composer.setPlusMenuOpen(false);
    if (surface !== "chat") {
      setCompactHistorySheetVisible(false);
    }
  };

  const handleMobileActionsToggle = () => {
    if (mobileActionsOpen) {
      setMobileActionsOpen(false);
      return;
    }

    composer.setPlusMenuOpen(false);
    setCompactHistorySheetVisible(false);
    setMobileActionsOpen(true);
  };

  const handleHistoryToggle = () => {
    composer.setPlusMenuOpen(false);
    if (compactViewport) {
      setMobileActionsOpen(false);
      setMobileSurface("chat");
      setCompactHistorySheetVisible((value) => !value);
      return;
    }

    toggleHistoryDrawer();
  };

  const handleCreateConversation = () => {
    composer.createConversationWithComposerState();
    if (compactViewport) {
      setCompactHistorySheetVisible(false);
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    composer.selectConversationWithComposerState(conversationId);
    if (compactViewport) {
      setCompactHistorySheetVisible(false);
    }
  };

  const conversationSidebarContent = (
    <WorkspaceConversationSidebar
      conversations={composer.conversations}
      activeConversationId={composer.activeConversationId}
      onCreateConversation={handleCreateConversation}
      onSelectConversation={handleSelectConversation}
    />
  );

  const chatThreadHeader = (
    <WorkspaceChatHeader
      title={composer.activeConversation?.title ?? "新会话"}
      sceneTransactionCount={sceneTransactionCount}
      historyOpen={effectiveHistoryDrawerVisible}
      onToggleHistory={handleHistoryToggle}
    />
  );

  const chatMessagesContent = (
    <WorkspaceChatMessages
      messages={composer.messages}
      compactViewport={compactViewport}
      compactEmptyStateTemplates={composer.compactEmptyStateTemplates}
      templates={composer.templates}
      showAgentSteps={showAgentSteps}
      mode={runtimeSession.mode}
      sessionToken={runtimeSession.sessionToken}
      onApplyTemplate={composer.applySlashTemplate}
    />
  );

  const composerContent = (
    <WorkspaceChatComposer
      composerFormRef={composerFormRef}
      composerRef={composerRef}
      imageInputRef={imageInputRef}
      plusMenuButtonRef={plusMenuButtonRef}
      plusMenuRef={plusMenuRef}
      plusMenuOpen={composer.plusMenuOpen}
      supportsVisionUpload={composer.supportsVisionUpload}
      templates={composer.templates}
      unsupportedVisionNotice={composer.unsupportedVisionNotice}
      draftAttachments={composer.draftAttachments}
      composerNotice={composer.composerNotice}
      slashMenuVisible={composer.slashMenuVisible}
      slashTemplates={composer.slashTemplates}
      slashSelectedIndex={composer.slashSelectedIndex}
      composerDragActive={composer.composerDragActive}
      draft={composer.draft}
      isSending={composer.isSending}
      onSubmit={composer.handleSend}
      onTogglePlusMenu={composer.togglePlusMenu}
      onApplyPlusTemplate={composer.applyPlusTemplate}
      onRemoveAttachment={composer.removeAttachment}
      onSetSlashSelectedIndex={composer.setSlashSelectedIndex}
      onApplySlashTemplate={composer.applySlashTemplate}
      onDragOver={composer.handleComposerDragOver}
      onDragLeave={composer.handleComposerDragLeave}
      onDrop={(event) => {
        void composer.handleComposerDrop(event);
      }}
      onDraftChange={composer.handleDraftChange}
      onComposerFocus={composer.handleComposerFocus}
      onKeyDown={composer.handleComposerKeyDown}
      onPaste={(event) => {
        void composer.handleComposerPaste(event);
      }}
      onImageChange={(event) => {
        void composer.handleComposerImageChange(event);
      }}
    />
  );

  return (
    <main
      className={`workspace-shell${
        !compactViewport && !chatVisible ? " chat-collapsed" : ""
      }${compactViewport ? ` mobile-surface-${mobileSurface}` : ""}${
        compactViewport ? " compact-viewport" : ""
      }${phoneViewport ? " phone-viewport" : ""}${
        shortViewport ? " short-viewport" : ""
      }`}
    >
      <WorkspaceTopBar
        mode={runtimeSession.mode}
        runtimeSupportsOfficial={runtimeSession.runtimeSupportsOfficial}
        activeRuntimeLabel={runtimeSession.activeRuntimeLabel}
        compactViewport={compactViewport}
        mobileActionsButtonRef={mobileActionsButtonRef}
        mobileActionsMenuRef={mobileActionsMenuRef}
        mobileActionsOpen={mobileActionsOpen}
        mobileSurface={mobileSurface}
        isSending={composer.isSending}
        isSceneRollingBack={isSceneRollingBack}
        sceneTransactionCount={sceneTransactionCount}
        sessionToken={runtimeSession.sessionToken}
        chatVisible={chatVisible}
        onModeChange={runtimeSession.handleModeChange}
        onOpenSettings={openSettingsDrawer}
        onToggleMobileActions={handleMobileActionsToggle}
        onRollbackAction={handleRollbackAction}
        onClearSceneAction={handleClearSceneAction}
        onLogoutAction={handleLogoutAction}
        onToggleChat={toggleChat}
        onSelectMobileSurface={handleSelectMobileSurface}
      />
      <div className="workspace-content">
        {!compactViewport ? (
          <>
            <aside
              className="studio-input-rail"
              data-testid="studio-input-rail"
              hidden={!chatVisible}
            >
              <div
                ref={chatShellRef}
                className={`chat-shell${
                  desktopHistoryOverlay ? " history-overlay-mode" : ""
                }`}
              >
                <div
                  className={`history-drawer${
                    historyDrawerVisible ? " history-drawer-open" : ""
                  }`}
                  style={historyDrawerStyle}
                >
                  {historyDrawerVisible ? (
                    <aside
                      className="conversation-sidebar"
                      data-testid="conversation-sidebar"
                    >
                      {conversationSidebarContent}
                    </aside>
                  ) : null}
                  <div
                    className="history-resizer"
                    data-testid="history-resizer"
                    hidden={!historyDrawerVisible}
                    onPointerDown={handleHistoryResizeStart}
                  />
                </div>
                <div className="chat-body studio-input-body">
                  <TeacherTemplateLibrary
                    open={templateLibraryOpen}
                    templates={composer.templates}
                    onApply={(prompt) => {
                      composer.setDraftForActiveConversation(prompt);
                      composerRef.current?.focus();
                    }}
                    onClose={() => setTemplateLibraryOpen(false)}
                  />
                  <StudioInputPanel
                    mode={desktopInputMode}
                    onModeChange={setDesktopInputMode}
                    conversationCount={composer.conversations.length}
                    templateCount={composer.templates.length}
                    onOpenTemplateLibrary={() => setTemplateLibraryOpen(true)}
                    headerSlot={chatThreadHeader}
                    composerSlot={composerContent}
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
                  message={composer.latestAssistantMessage}
                  onAction={composer.sendFollowUpPrompt}
                />
                {chatMessagesContent}
              </div>
            </ChatPanel>
          </>
        ) : (
          <>
            <CanvasPanel
              key={canvasMountKey}
              profile={canvasProfile}
              visible={canvasVisible}
            />
            <ChatPanel visible={effectiveChatVisible}>
              <div
                ref={chatShellRef}
                className={`chat-shell${
                  desktopHistoryOverlay ? " history-overlay-mode" : ""
                }`}
              >
                <div className="chat-body">
                  {chatThreadHeader}
                  {chatMessagesContent}
                  {composerContent}
                </div>
                {compactViewport && compactHistorySheetVisible ? (
                  <div
                    className="history-sheet-backdrop"
                    data-testid="history-sheet-backdrop"
                    onClick={() => setCompactHistorySheetVisible(false)}
                  >
                    <div
                      className="history-sheet"
                      data-testid="history-sheet"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="history-sheet-handle" />
                      <aside
                        className="conversation-sidebar"
                        data-testid="conversation-sidebar"
                      >
                        {conversationSidebarContent}
                      </aside>
                    </div>
                  </div>
                ) : null}
              </div>
            </ChatPanel>
          </>
        )}
      </div>
      <TokenGateDialog
        open={runtimeSession.tokenDialogOpen && runtimeSession.runtimeSupportsOfficial}
        onClose={runtimeSession.closeTokenDialog}
        onSubmit={runtimeSession.submitToken}
      />
      <SettingsDrawer
        open={settingsOpen}
        activeConversationId={composer.activeConversationId}
        currentMode={runtimeSession.mode}
        onClose={() => setSettingsOpen(false)}
        onApplyMode={runtimeSession.setMode}
      />
    </main>
  );
};
