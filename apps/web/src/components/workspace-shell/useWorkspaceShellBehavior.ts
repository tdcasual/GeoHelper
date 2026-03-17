import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect } from "react";

import { sceneFocusStore } from "../../state/scene-focus-store";
import { type StudioStartMode } from "../../state/studio-start";
import { resolveHistoryDrawerLayout } from "./history-layout";
import { resolveWorkspaceViewportState } from "./viewport";

type MobileSurface = "canvas" | "chat";

interface CanvasFocusNoticeState {
  message: string;
  tone: "info" | "warning";
  uncertaintyId: string | null;
}

interface WorkspaceShellComposerAdapter {
  plusMenuOpen: boolean;
  slashMenuVisible: boolean;
  setPlusMenuOpen: (open: boolean) => void;
  closeComposerMenus: () => void;
  latestAssistantMessage: {
    result?: {
      uncertaintyItems?: Array<{
        id: string;
        label: string;
      }>;
      canvasLinks?: Array<{
        scope: string;
        uncertaintyId?: string;
        objectLabels: string[];
      }>;
    };
  } | null;
  createConversationWithComposerState: () => void;
  selectConversationWithComposerState: (conversationId: string) => void;
  setDraftForActiveConversation: (prompt: string) => void;
}

interface WorkspaceShellBehaviorParams {
  chatShellRef: RefObject<HTMLDivElement | null>;
  composerFormRef: RefObject<HTMLFormElement | null>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  mobileActionsButtonRef: RefObject<HTMLButtonElement | null>;
  mobileActionsMenuRef: RefObject<HTMLDivElement | null>;
  plusMenuButtonRef: RefObject<HTMLButtonElement | null>;
  plusMenuRef: RefObject<HTMLDivElement | null>;
  initialDesktopInputMode: StudioStartMode;
  initialTemplateLibraryOpen: boolean;
  onTemplateLibraryOpenChange?: (open: boolean) => void;
  composer: WorkspaceShellComposerAdapter;
  chatVisible: boolean;
  historyDrawerVisible: boolean;
  historyDrawerWidth: number;
  toggleHistoryDrawer: () => void;
  setHistoryDrawerWidth: (width: number) => void;
  setSettingsOpen: (open: boolean) => void;
  rollbackLastScene: () => Promise<unknown>;
  clearScene: () => Promise<void>;
  handleLogout: () => Promise<unknown>;
  compactViewport: boolean;
  setIsCompactViewport: (value: boolean) => void;
  phoneViewport: boolean;
  setIsMobileViewport: (value: boolean) => void;
  shortViewport: boolean;
  setIsShortViewport: (value: boolean) => void;
  mobileSurface: MobileSurface;
  setMobileSurface: (surface: MobileSurface) => void;
  mobileActionsOpen: boolean;
  setMobileActionsOpen: (open: boolean) => void;
  compactHistorySheetVisible: boolean;
  setCompactHistorySheetVisible: (open: boolean | ((value: boolean) => boolean)) => void;
  canvasFullscreenActive: boolean;
  setCanvasFullscreenActive: (open: boolean) => void;
  chatShellWidth: number;
  setChatShellWidth: (width: number) => void;
  desktopInputMode: StudioStartMode;
  setDesktopInputMode: (mode: StudioStartMode) => void;
  templateLibraryOpen: boolean;
  setTemplateLibraryOpen: (open: boolean) => void;
  activeFocusUncertaintyId: string | null;
  setActiveFocusUncertaintyId: (
    value: string | null | ((current: string | null) => string | null)
  ) => void;
  canvasFocusNotice: CanvasFocusNoticeState | null;
  setCanvasFocusNotice: (value: CanvasFocusNoticeState | null) => void;
  rawCanvasMountKey: string;
  setCanvasMountKey: (key: string) => void;
}

export const useWorkspaceShellBehavior = (
  params: WorkspaceShellBehaviorParams
) => {
  const effectiveHistoryDrawerVisible = params.compactViewport
    ? params.compactHistorySheetVisible
    : params.historyDrawerVisible;
  const canvasVisible =
    !params.compactViewport || params.mobileSurface === "canvas";
  const effectiveChatVisible = params.compactViewport
    ? params.mobileSurface === "chat"
    : params.chatVisible;

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const syncFullscreenState = () => {
      params.setCanvasFullscreenActive(!!document.fullscreenElement);
    };

    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
    };
  }, [params.setCanvasFullscreenActive]);

  useEffect(() => {
    if (!params.canvasFullscreenActive) {
      params.setCanvasMountKey(params.rawCanvasMountKey);
    }
  }, [
    params.canvasFullscreenActive,
    params.rawCanvasMountKey,
    params.setCanvasMountKey
  ]);

  useEffect(() => {
    const syncViewport = () => {
      const { compactViewport, phoneViewport, shortViewport } =
        resolveWorkspaceViewportState({
          width: window.innerWidth,
          height: window.innerHeight
        });
      params.setIsCompactViewport(compactViewport);
      params.setIsMobileViewport(phoneViewport);
      params.setIsShortViewport(shortViewport);
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
    };
  }, [
    params.setIsCompactViewport,
    params.setIsMobileViewport,
    params.setIsShortViewport
  ]);

  useEffect(() => {
    if (!params.compactViewport) {
      params.setMobileActionsOpen(false);
      params.setCompactHistorySheetVisible(false);
      return;
    }

    params.setMobileActionsOpen(false);
    params.setMobileSurface("canvas");
    params.setCompactHistorySheetVisible(false);
  }, [
    params.compactViewport,
    params.setCompactHistorySheetVisible,
    params.setMobileActionsOpen,
    params.setMobileSurface
  ]);

  useEffect(() => {
    if (
      params.compactViewport &&
      params.mobileSurface !== "chat" &&
      params.compactHistorySheetVisible
    ) {
      params.setCompactHistorySheetVisible(false);
    }
  }, [
    params.compactHistorySheetVisible,
    params.compactViewport,
    params.mobileSurface,
    params.setCompactHistorySheetVisible
  ]);

  useEffect(() => {
    const node = params.chatShellRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 0;
      params.setChatShellWidth(nextWidth);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [params.chatShellRef, params.setChatShellWidth]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (params.mobileActionsOpen) {
        const insideActionsMenu = params.mobileActionsMenuRef.current?.contains(
          target
        );
        const insideActionsButton =
          params.mobileActionsButtonRef.current?.contains(target);
        if (!insideActionsMenu && !insideActionsButton) {
          params.setMobileActionsOpen(false);
        }
      }

      if (params.composer.plusMenuOpen) {
        const insidePlusMenu = params.plusMenuRef.current?.contains(target);
        const insidePlusButton =
          params.plusMenuButtonRef.current?.contains(target);
        if (!insidePlusMenu && !insidePlusButton) {
          params.composer.setPlusMenuOpen(false);
        }
      }

      if (params.composer.slashMenuVisible) {
        const insideComposer = params.composerFormRef.current?.contains(target);
        if (!insideComposer) {
          params.composer.closeComposerMenus();
        }
      }
    };

    if (
      params.mobileActionsOpen ||
      params.composer.plusMenuOpen ||
      params.composer.slashMenuVisible
    ) {
      document.addEventListener("pointerdown", handlePointerDown);
    }

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [
    params.composer,
    params.composerFormRef,
    params.mobileActionsButtonRef,
    params.mobileActionsMenuRef,
    params.mobileActionsOpen,
    params.plusMenuButtonRef,
    params.plusMenuRef,
    params.setMobileActionsOpen
  ]);

  useEffect(() => {
    params.setDesktopInputMode(params.initialDesktopInputMode);
  }, [params.initialDesktopInputMode, params.setDesktopInputMode]);

  useEffect(() => {
    params.setTemplateLibraryOpen(params.initialTemplateLibraryOpen);
  }, [params.initialTemplateLibraryOpen, params.setTemplateLibraryOpen]);

  useEffect(() => {
    if (!params.canvasFocusNotice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      params.setCanvasFocusNotice(null);
      params.setActiveFocusUncertaintyId((current) =>
        current === params.canvasFocusNotice?.uncertaintyId ? null : current
      );
    }, 4200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    params.canvasFocusNotice,
    params.setActiveFocusUncertaintyId,
    params.setCanvasFocusNotice
  ]);

  useEffect(() => {
    params.onTemplateLibraryOpenChange?.(params.templateLibraryOpen);
  }, [params.onTemplateLibraryOpenChange, params.templateLibraryOpen]);

  useEffect(() => {
    const currentUncertainties =
      params.composer.latestAssistantMessage?.result?.uncertaintyItems ?? [];
    if (
      params.activeFocusUncertaintyId &&
      !currentUncertainties.some(
        (item) => item.id === params.activeFocusUncertaintyId
      )
    ) {
      params.setActiveFocusUncertaintyId(null);
    }
  }, [
    params.activeFocusUncertaintyId,
    params.composer.latestAssistantMessage,
    params.setActiveFocusUncertaintyId
  ]);

  const historyLayout = resolveHistoryDrawerLayout({
    compactViewport: params.compactViewport,
    chatShellWidth: params.chatShellWidth,
    historyDrawerVisible: params.historyDrawerVisible,
    historyDrawerWidth: params.historyDrawerWidth
  });

  const openSettingsDrawer = () => {
    params.setSettingsOpen(true);
    params.setMobileActionsOpen(false);
    params.composer.closeComposerMenus();
    if (params.compactViewport) {
      params.setCompactHistorySheetVisible(false);
    }
  };

  const handleHistoryResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !params.historyDrawerVisible ||
      params.phoneViewport ||
      historyLayout.desktopHistoryOverlay
    ) {
      return;
    }

    event.preventDefault();
    const startX = event.clientX;
    const startWidth = historyLayout.computedHistoryDrawerWidth;
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      params.setHistoryDrawerWidth(startWidth + delta);
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
    params.setMobileActionsOpen(false);
    params.composer.setPlusMenuOpen(false);
    void params.rollbackLastScene();
  };

  const handleClearSceneAction = () => {
    params.setMobileActionsOpen(false);
    params.composer.setPlusMenuOpen(false);
    void params.clearScene();
  };

  const handleLogoutAction = () => {
    params.setMobileActionsOpen(false);
    params.composer.setPlusMenuOpen(false);
    void params.handleLogout();
  };

  const handleSelectMobileSurface = (surface: MobileSurface) => {
    params.setMobileSurface(surface);
    params.setMobileActionsOpen(false);
    params.composer.setPlusMenuOpen(false);
    if (surface !== "chat") {
      params.setCompactHistorySheetVisible(false);
    }
  };

  const handleMobileActionsToggle = () => {
    if (params.mobileActionsOpen) {
      params.setMobileActionsOpen(false);
      return;
    }

    params.composer.setPlusMenuOpen(false);
    params.setCompactHistorySheetVisible(false);
    params.setMobileActionsOpen(true);
  };

  const handleHistoryToggle = () => {
    params.composer.setPlusMenuOpen(false);
    if (params.compactViewport) {
      params.setMobileActionsOpen(false);
      params.setMobileSurface("chat");
      params.setCompactHistorySheetVisible((value) => !value);
      return;
    }

    params.toggleHistoryDrawer();
  };

  const handleCreateConversation = () => {
    params.composer.createConversationWithComposerState();
    if (params.compactViewport) {
      params.setCompactHistorySheetVisible(false);
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    params.composer.selectConversationWithComposerState(conversationId);
    if (params.compactViewport) {
      params.setCompactHistorySheetVisible(false);
    }
  };

  const handleApplyTemplateLibrary = (prompt: string) => {
    params.composer.setDraftForActiveConversation(prompt);
    params.composerRef.current?.focus();
  };

  const handleFocusUncertainty = (uncertaintyId: string) => {
    const result = params.composer.latestAssistantMessage?.result;
    const uncertainty = result?.uncertaintyItems?.find(
      (item) => item.id === uncertaintyId
    );
    const canvasLink = result?.canvasLinks?.find(
      (item) =>
        item.scope === "uncertainty" && item.uncertaintyId === uncertaintyId
    );

    if (!uncertainty) {
      return;
    }

    if (canvasLink) {
      sceneFocusStore.getState().requestFocus({
        source: "uncertainty",
        objectLabels: canvasLink.objectLabels,
        revealCanvas: true,
        ttlMs: 4200
      });
      params.setActiveFocusUncertaintyId(uncertaintyId);
      params.setCanvasFocusNotice({
        message: `已定位对象：${canvasLink.objectLabels.join("、")}`,
        tone: "info",
        uncertaintyId
      });
      if (params.compactViewport) {
        params.setMobileSurface("canvas");
      }
      return;
    }

    params.setActiveFocusUncertaintyId(uncertaintyId);
    params.setCanvasFocusNotice({
      message: `暂时无法自动定位“${uncertainty.label}”，请手动核对画布。`,
      tone: "warning",
      uncertaintyId
    });
    if (params.compactViewport) {
      params.setMobileSurface("canvas");
    }
  };

  return {
    computedHistoryDrawerWidth: historyLayout.computedHistoryDrawerWidth,
    desktopHistoryOverlay: historyLayout.desktopHistoryOverlay,
    historyDrawerStyle: historyLayout.historyDrawerStyle,
    effectiveHistoryDrawerVisible,
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
  };
};
