import { useRef, useState } from "react";

import { useArtifactStore } from "../state/artifact-store";
import { useCheckpointStore } from "../state/checkpoint-store";
import { useRunStore } from "../state/run-store";
import { useSceneStore } from "../state/scene-store";
import { useSettingsStore } from "../state/settings-store";
import { type StudioStartMode } from "../state/studio-start";
import { useUIStore } from "../state/ui-store";
import { RunConsole } from "./RunConsole";
import { SettingsDrawer } from "./SettingsDrawer";
import { TokenGateDialog } from "./TokenGateDialog";
import { buildWorkspaceLayoutProps } from "./workspace-shell/layout-props";
import {
  selectArtifactsForRun,
  selectCheckpointsForRun,
  selectChildRunsForRun,
  selectLatestRun,
  selectLatestRunEvents
} from "./workspace-shell/platform-run-selectors";
import { useWorkspaceComposer } from "./workspace-shell/useWorkspaceComposer";
import { useWorkspaceRuntimeSession } from "./workspace-shell/useWorkspaceRuntimeSession";
import { useWorkspaceShellBehavior } from "./workspace-shell/useWorkspaceShellBehavior";
import { WorkspaceCompactLayout } from "./workspace-shell/WorkspaceCompactLayout";
import { WorkspaceDesktopLayout } from "./workspace-shell/WorkspaceDesktopLayout";
import { WorkspaceTopBar } from "./workspace-shell/WorkspaceTopBar";

// Layout boundary refs: ./workspace-shell/WorkspaceConversationSidebar ./workspace-shell/WorkspaceChatMessages ./workspace-shell/WorkspaceChatComposer ./workspace-shell/WorkspaceChatHeader ./workspace-shell/viewport ./workspace-shell/history-layout

type MobileSurface = "canvas" | "chat";

interface CanvasFocusNoticeState {
  message: string;
  tone: "info" | "warning";
  uncertaintyId: string | null;
}

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
  const latestPlatformRunId = useRunStore((state) => state.latestRunId);
  const latestPlatformRun = useRunStore(selectLatestRun);
  const latestPlatformEvents = useRunStore(selectLatestRunEvents);
  const latestPlatformChildRuns = useRunStore((state) =>
    selectChildRunsForRun(state, latestPlatformRunId)
  );
  const latestPlatformCheckpoints = useCheckpointStore((state) =>
    selectCheckpointsForRun(state, latestPlatformRunId)
  );
  const latestPlatformArtifacts = useArtifactStore((state) =>
    selectArtifactsForRun(state, latestPlatformRunId)
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
  const [activeFocusUncertaintyId, setActiveFocusUncertaintyId] = useState<
    string | null
  >(null);
  const [canvasFocusNotice, setCanvasFocusNotice] =
    useState<CanvasFocusNoticeState | null>(null);

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
  const {
    desktopHistoryOverlay,
    historyDrawerStyle,
    canvasVisible,
    effectiveChatVisible,
    openSettingsDrawer,
    handleHistoryResizeStart,
    handleRollbackAction,
    handleClearSceneAction,
    handleLogoutAction,
    handleSelectMobileSurface,
    handleMobileActionsToggle,
    handleHistoryToggle,
    handleCreateConversation,
    handleSelectConversation,
    handleApplyTemplateLibrary,
    handleFocusUncertainty
  } = useWorkspaceShellBehavior({
    chatShellRef,
    composerFormRef,
    composerRef,
    mobileActionsButtonRef,
    mobileActionsMenuRef,
    plusMenuButtonRef,
    plusMenuRef,
    initialDesktopInputMode,
    initialTemplateLibraryOpen,
    onTemplateLibraryOpenChange,
    composer,
    chatVisible,
    historyDrawerVisible,
    historyDrawerWidth,
    toggleHistoryDrawer,
    setHistoryDrawerWidth,
    setSettingsOpen,
    rollbackLastScene,
    clearScene,
    handleLogout: runtimeSession.handleLogout,
    compactViewport,
    setIsCompactViewport,
    phoneViewport,
    setIsMobileViewport,
    shortViewport,
    setIsShortViewport,
    mobileSurface,
    setMobileSurface,
    mobileActionsOpen,
    setMobileActionsOpen,
    compactHistorySheetVisible,
    setCompactHistorySheetVisible,
    canvasFullscreenActive,
    setCanvasFullscreenActive,
    chatShellWidth,
    setChatShellWidth,
    desktopInputMode,
    setDesktopInputMode,
    templateLibraryOpen,
    setTemplateLibraryOpen,
    activeFocusUncertaintyId,
    setActiveFocusUncertaintyId,
    canvasFocusNotice,
    setCanvasFocusNotice,
    rawCanvasMountKey,
    setCanvasMountKey
  });

  const {
    conversationSidebarProps,
    chatHeaderProps,
    chatMessagesProps,
    chatComposerProps,
    recentConversations,
    recentTemplates,
    currentConversationTitle
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
            currentConversationTitle={currentConversationTitle}
            recentConversations={recentConversations}
            recentTemplates={recentTemplates}
            onContinueCurrent={() => {
              composerRef.current?.focus();
            }}
            onSelectConversation={handleSelectConversation}
            onApplyContinueTemplate={handleApplyTemplateLibrary}
            onOpenTemplateLibrary={() => setTemplateLibraryOpen(true)}
            chatHeaderProps={chatHeaderProps}
            chatComposerProps={chatComposerProps}
            canvasMountKey={canvasMountKey}
            canvasProfile={canvasProfile}
            canvasVisible={canvasVisible}
            canvasFocusNotice={canvasFocusNotice}
            latestAssistantMessage={composer.latestAssistantMessage}
            onStudioResultAction={composer.sendFollowUpPrompt}
            onRetryLatestPrompt={composer.retryLatestPrompt}
            onConfirmLatestUncertainty={composer.confirmUncertainty}
            onRepairLatestUncertainty={composer.repairUncertainty}
            onFocusLatestUncertainty={handleFocusUncertainty}
            activeFocusUncertaintyId={activeFocusUncertaintyId}
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
            currentConversationTitle={currentConversationTitle}
            recentConversations={recentConversations}
            recentTemplates={recentTemplates}
            onContinueCurrent={() => {
              composerRef.current?.focus();
            }}
            onSelectConversation={handleSelectConversation}
            onApplyTemplate={handleApplyTemplateLibrary}
            onOpenTemplateLibrary={() => setTemplateLibraryOpen(true)}
            latestAssistantMessage={composer.latestAssistantMessage}
            onStudioResultAction={composer.sendFollowUpPrompt}
            onRetryLatestPrompt={composer.retryLatestPrompt}
            onConfirmLatestUncertainty={composer.confirmUncertainty}
            onRepairLatestUncertainty={composer.repairUncertainty}
            onFocusLatestUncertainty={handleFocusUncertainty}
            activeFocusUncertaintyId={activeFocusUncertaintyId}
            canvasMountKey={canvasMountKey}
            canvasProfile={canvasProfile}
            canvasVisible={canvasVisible}
            canvasFocusNotice={canvasFocusNotice}
          />
        )}
      </div>
      {showAgentSteps || latestPlatformRun ? (
        <section className="workspace-platform-console">
          <RunConsole
            run={latestPlatformRun}
            events={latestPlatformEvents}
            childRuns={latestPlatformChildRuns}
            checkpoints={latestPlatformCheckpoints}
            artifacts={latestPlatformArtifacts}
          />
        </section>
      ) : null}
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
