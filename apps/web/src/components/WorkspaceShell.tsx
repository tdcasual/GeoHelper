import type { PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { useSceneStore } from "../state/scene-store";
import { useSettingsStore } from "../state/settings-store";
import { type StudioStartMode } from "../state/studio-start";
import { useUIStore } from "../state/ui-store";
import { SettingsDrawer } from "./SettingsDrawer";
import { TokenGateDialog } from "./TokenGateDialog";
import { resolveHistoryDrawerLayout } from "./workspace-shell/history-layout";
import { buildWorkspaceLayoutProps } from "./workspace-shell/layout-props";
import { useWorkspaceComposer } from "./workspace-shell/useWorkspaceComposer";
import { useWorkspaceRuntimeSession } from "./workspace-shell/useWorkspaceRuntimeSession";
import { resolveWorkspaceViewportState } from "./workspace-shell/viewport";
import { WorkspaceCompactLayout } from "./workspace-shell/WorkspaceCompactLayout";
import { WorkspaceDesktopLayout } from "./workspace-shell/WorkspaceDesktopLayout";
import { WorkspaceTopBar } from "./workspace-shell/WorkspaceTopBar";

// Layout boundary refs: ./workspace-shell/WorkspaceConversationSidebar ./workspace-shell/WorkspaceChatMessages ./workspace-shell/WorkspaceChatComposer ./workspace-shell/WorkspaceChatHeader

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
      const { compactViewport, phoneViewport, shortViewport } =
        resolveWorkspaceViewportState({
          width: window.innerWidth,
          height: window.innerHeight
        });
      setIsCompactViewport(compactViewport);
      setIsMobileViewport(phoneViewport);
      setIsShortViewport(shortViewport);
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

  const { computedHistoryDrawerWidth, desktopHistoryOverlay, historyDrawerStyle } =
    resolveHistoryDrawerLayout({
      compactViewport,
      chatShellWidth,
      historyDrawerVisible,
      historyDrawerWidth
    });

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
    if (!historyDrawerVisible || phoneViewport || desktopHistoryOverlay) {
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

  const handleApplyTemplateLibrary = (prompt: string) => {
    composer.setDraftForActiveConversation(prompt);
    composerRef.current?.focus();
  };

  const {
    conversationSidebarProps,
    chatHeaderProps,
    chatMessagesProps,
    chatComposerProps
  } = buildWorkspaceLayoutProps({
    composer,
    compactViewport,
    showAgentSteps,
    sceneTransactionCount,
    effectiveHistoryDrawerVisible,
    runtimeMode: runtimeSession.mode,
    sessionToken: runtimeSession.sessionToken,
    onToggleHistory: handleHistoryToggle,
    onCreateConversation: handleCreateConversation,
    onSelectConversation: handleSelectConversation,
    composerFormRef,
    composerRef,
    imageInputRef,
    plusMenuButtonRef,
    plusMenuRef
  });

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
          <WorkspaceDesktopLayout
            chatVisible={chatVisible}
            chatShellRef={chatShellRef}
            desktopHistoryOverlay={desktopHistoryOverlay}
            historyDrawerVisible={historyDrawerVisible}
            historyDrawerStyle={historyDrawerStyle}
            onHistoryResizeStart={handleHistoryResizeStart}
            conversationSidebarProps={conversationSidebarProps}
            templateLibraryOpen={templateLibraryOpen}
            templateLibraryTemplates={composer.templates}
            onApplyTemplateLibrary={handleApplyTemplateLibrary}
            onCloseTemplateLibrary={() => setTemplateLibraryOpen(false)}
            desktopInputMode={desktopInputMode}
            onDesktopInputModeChange={setDesktopInputMode}
            conversationCount={composer.conversations.length}
            templateCount={composer.templates.length}
            onOpenTemplateLibrary={() => setTemplateLibraryOpen(true)}
            chatHeaderProps={chatHeaderProps}
            chatComposerProps={chatComposerProps}
            canvasMountKey={canvasMountKey}
            canvasProfile={canvasProfile}
            canvasVisible={canvasVisible}
            latestAssistantMessage={composer.latestAssistantMessage}
            onStudioResultAction={composer.sendFollowUpPrompt}
            chatMessagesProps={chatMessagesProps}
          />
        ) : (
          <WorkspaceCompactLayout
            chatVisible={effectiveChatVisible}
            chatShellRef={chatShellRef}
            chatHeaderProps={chatHeaderProps}
            chatMessagesProps={chatMessagesProps}
            chatComposerProps={chatComposerProps}
            compactHistorySheetVisible={compactHistorySheetVisible}
            onCloseHistorySheet={() => setCompactHistorySheetVisible(false)}
            conversationSidebarProps={conversationSidebarProps}
            canvasMountKey={canvasMountKey}
            canvasProfile={canvasProfile}
            canvasVisible={canvasVisible}
          />
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
