import {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { CanvasPanel } from "./CanvasPanel";
import { ChatPanel } from "./ChatPanel";
import { ModelModeSwitcher } from "./ModelModeSwitcher";
import { SettingsDrawer } from "./SettingsDrawer";
import { TokenGateDialog } from "./TokenGateDialog";
import {
  loginWithRuntime,
  resolveRuntimeCapabilities,
  revokeRuntimeSession
} from "../runtime/runtime-service";
import { runtimeCapabilitiesByTarget } from "../runtime/types";
import { ChatAttachment, useChatStore } from "../state/chat-store";
import { useSceneStore } from "../state/scene-store";
import {
  resolveRuntimeCapabilitiesForModel,
  useSettingsStore
} from "../state/settings-store";
import { useTemplateStore } from "../state/template-store";
import { useUIStore } from "../state/ui-store";

interface ComposerDraftState {
  text: string;
  attachments: ChatAttachment[];
}

const EMPTY_COMPOSER_DRAFT: ComposerDraftState = {
  text: "",
  attachments: []
};

type MobileSurface = "canvas" | "chat";

const readFileAsDataUrl = async (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("FILE_READ_FAILED"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FILE_READ_FAILED"));
    reader.readAsDataURL(file);
  });

export const WorkspaceShell = () => {
  const chatVisible = useUIStore((state) => state.chatVisible);
  const historyDrawerVisible = useUIStore(
    (state) => state.historyDrawerVisible
  );
  const historyDrawerWidth = useUIStore((state) => state.historyDrawerWidth);
  const toggleChat = useUIStore((state) => state.toggleChat);
  const toggleHistoryDrawer = useUIStore((state) => state.toggleHistoryDrawer);
  const setHistoryDrawerVisible = useUIStore(
    (state) => state.setHistoryDrawerVisible
  );
  const setHistoryDrawerWidth = useUIStore(
    (state) => state.setHistoryDrawerWidth
  );
  const mode = useChatStore((state) => state.mode);
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore(
    (state) => state.activeConversationId
  );
  const messages = useChatStore((state) => state.messages);
  const isSending = useChatStore((state) => state.isSending);
  const reauthRequired = useChatStore((state) => state.reauthRequired);
  const sessionToken = useChatStore((state) => state.sessionToken);
  const setMode = useChatStore((state) => state.setMode);
  const setSessionToken = useChatStore((state) => state.setSessionToken);
  const createConversation = useChatStore((state) => state.createConversation);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const acknowledgeReauth = useChatStore((state) => state.acknowledgeReauth);
  const send = useChatStore((state) => state.send);
  const sceneTransactionCount = useSceneStore(
    (state) => state.transactions.length
  );
  const isSceneRollingBack = useSceneStore((state) => state.isRollingBack);
  const rollbackLastScene = useSceneStore((state) => state.rollbackLast);
  const clearScene = useSceneStore((state) => state.clearScene);
  const settingsOpen = useSettingsStore((state) => state.drawerOpen);
  const setSettingsOpen = useSettingsStore((state) => state.setDrawerOpen);
  const runtimeProfiles = useSettingsStore((state) => state.runtimeProfiles);
  const defaultRuntimeProfileId = useSettingsStore(
    (state) => state.defaultRuntimeProfileId
  );
  const showAgentSteps = useSettingsStore(
    (state) => state.experimentFlags.showAgentSteps
  );
  const byokPresets = useSettingsStore((state) => state.byokPresets);
  const officialPresets = useSettingsStore((state) => state.officialPresets);
  const defaultByokPresetId = useSettingsStore(
    (state) => state.defaultByokPresetId
  );
  const defaultOfficialPresetId = useSettingsStore(
    (state) => state.defaultOfficialPresetId
  );
  const sessionOverrides = useSettingsStore((state) => state.sessionOverrides);
  const templates = useTemplateStore((state) => state.templates);
  const chatShellRef = useRef<HTMLDivElement | null>(null);
  const composerFormRef = useRef<HTMLFormElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const mobileActionsButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileActionsMenuRef = useRef<HTMLDivElement | null>(null);
  const plusMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const plusMenuRef = useRef<HTMLDivElement | null>(null);
  const [draftByConversationId, setDraftByConversationId] = useState<
    Record<string, ComposerDraftState>
  >({});
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [slashMenuDismissed, setSlashMenuDismissed] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const [composerDragActive, setComposerDragActive] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isShortViewport, setIsShortViewport] = useState(false);
  const [mobileSurface, setMobileSurface] = useState<MobileSurface>("canvas");
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [compactHistorySheetVisible, setCompactHistorySheetVisible] =
    useState(false);
  const [canvasFullscreenActive, setCanvasFullscreenActive] = useState(false);
  const [chatShellWidth, setChatShellWidth] = useState(0);
  const activeRuntimeProfile = useMemo(
    () =>
      runtimeProfiles.find((item) => item.id === defaultRuntimeProfileId) ??
      runtimeProfiles[0],
    [runtimeProfiles, defaultRuntimeProfileId]
  );
  const runtimeTarget = activeRuntimeProfile?.target ?? "direct";
  const runtimeBaseUrl = activeRuntimeProfile?.baseUrl || undefined;
  const runtimeCapabilities = runtimeCapabilitiesByTarget[runtimeTarget];
  const runtimeSupportsOfficial = runtimeCapabilities.supportsOfficialAuth;
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

  const deviceId = useMemo(() => {
    const key = "geohelper.device.id";
    const existing = localStorage.getItem(key);
    if (existing) {
      return existing;
    }

    const next = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    localStorage.setItem(key, next);
    return next;
  }, []);

  const handleModeChange = (nextMode: "byok" | "official") => {
    if (nextMode === "official" && !runtimeSupportsOfficial) {
      setSettingsOpen(true);
      return;
    }
    setMode(nextMode);
    if (nextMode === "official" && !sessionToken) {
      setTokenDialogOpen(true);
    }
  };

  useEffect(() => {
    if (mode === "official" && reauthRequired && runtimeSupportsOfficial) {
      setTokenDialogOpen(true);
      acknowledgeReauth();
    }
  }, [mode, reauthRequired, runtimeSupportsOfficial, acknowledgeReauth]);

  useEffect(() => {
    if (mode === "official" && !runtimeSupportsOfficial) {
      setMode("byok");
      setSessionToken(null);
      setTokenDialogOpen(false);
    }
  }, [mode, runtimeSupportsOfficial, setMode, setSessionToken]);

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

  const handleOfficialLogout = async () => {
    if (!sessionToken) {
      return;
    }

    try {
      await revokeRuntimeSession({
        target: runtimeTarget,
        baseUrl: runtimeBaseUrl,
        sessionToken
      });
    } catch {
      // Even when revoke fails remotely, local session must be cleared.
    }

    setSessionToken(null);
  };

  const activeConversation =
    conversations.find((item) => item.id === activeConversationId) ??
    conversations[0];
  const activeConversationKey =
    activeConversationId ?? activeConversation?.id ?? "conversation_default";
  const activeDraft =
    draftByConversationId[activeConversationKey] ?? EMPTY_COMPOSER_DRAFT;
  const draft = activeDraft.text;
  const draftAttachments = activeDraft.attachments;
  const slashQuery = draft.startsWith("/") ? draft.slice(1).trim() : "";
  const activePresetModel =
    mode === "byok"
      ? byokPresets.find((item) => item.id === defaultByokPresetId)?.model
      : officialPresets.find((item) => item.id === defaultOfficialPresetId)?.model;
  const activeModel =
    (activeConversationId
      ? sessionOverrides[activeConversationId]?.model
      : undefined) ?? activePresetModel;
  const unsupportedVisionNotice = "当前运行时或模型未开启图片能力";
  const [composerCapabilities, setComposerCapabilities] = useState(() =>
    resolveRuntimeCapabilitiesForModel({
      runtimeTarget,
      model: activeModel
    })
  );
  const supportsVisionUpload = composerCapabilities.supportsVision;

  useEffect(() => {
    const fallback = resolveRuntimeCapabilitiesForModel({
      runtimeTarget,
      model: activeModel
    });
    let cancelled = false;

    setComposerCapabilities(fallback);
    void resolveRuntimeCapabilities({
      target: runtimeTarget,
      baseUrl: runtimeBaseUrl,
      model: activeModel
    })
      .then((capabilities) => {
        if (!cancelled) {
          setComposerCapabilities(capabilities);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setComposerCapabilities(fallback);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeModel, runtimeBaseUrl, runtimeTarget]);

  const slashTemplates = useMemo(() => {
    if (!draft.startsWith("/")) {
      return [];
    }
    if (!slashQuery) {
      return templates.slice(0, 8);
    }

    const query = slashQuery.toLowerCase();
    return templates
      .filter(
        (template) =>
          template.title.toLowerCase().includes(query) ||
          template.prompt.toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [draft, slashQuery, templates]);
  const slashMenuActive = draft.startsWith("/") && slashTemplates.length > 0;
  const slashMenuVisible = slashMenuActive && !slashMenuDismissed;
  const compactEmptyStateTemplates = useMemo(
    () => templates.slice(0, phoneViewport ? 2 : 3),
    [phoneViewport, templates]
  );
  const minimumDesktopChatWidthForInlineHistory = 360;
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
    if (slashSelectedIndex >= slashTemplates.length) {
      setSlashSelectedIndex(0);
    }
  }, [slashSelectedIndex, slashTemplates.length]);

  useEffect(() => {
    setSlashMenuDismissed(false);
    setSlashSelectedIndex(0);
  }, [activeConversationKey]);

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

      if (plusMenuOpen) {
        const insidePlusMenu = plusMenuRef.current?.contains(target);
        const insidePlusButton = plusMenuButtonRef.current?.contains(target);
        if (!insidePlusMenu && !insidePlusButton) {
          setPlusMenuOpen(false);
        }
      }

      if (slashMenuVisible) {
        const insideComposer = composerFormRef.current?.contains(target);
        if (!insideComposer) {
          setSlashMenuDismissed(true);
          setSlashSelectedIndex(0);
        }
      }
    };

    if (mobileActionsOpen || plusMenuOpen || slashMenuVisible) {
      document.addEventListener("pointerdown", handlePointerDown);
    }

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [mobileActionsOpen, plusMenuOpen, slashMenuVisible]);

  const setDraftStateForActiveConversation = (
    updater:
      | ComposerDraftState
      | ((previous: ComposerDraftState) => ComposerDraftState)
  ) => {
    setDraftByConversationId((state) => {
      const previous =
        state[activeConversationKey] ?? EMPTY_COMPOSER_DRAFT;
      const next =
        typeof updater === "function" ? updater(previous) : updater;
      return {
        ...state,
        [activeConversationKey]: next
      };
    });
  };

  const setDraftForActiveConversation = (value: string) => {
    setDraftStateForActiveConversation((previous) => ({
      ...previous,
      text: value
    }));
  };

  const setAttachmentsForActiveConversation = (attachments: ChatAttachment[]) => {
    setDraftStateForActiveConversation((previous) => ({
      ...previous,
      attachments
    }));
  };

  const appendImageAttachments = async (files: FileList | File[]) => {
    if (!supportsVisionUpload) {
      setComposerNotice(unsupportedVisionNotice);
      return;
    }

    const incoming = Array.from(files);
    const imageFiles = incoming.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      setComposerNotice("仅支持上传图片文件");
      return;
    }

    const availableSlots = Math.max(0, 4 - draftAttachments.length);
    if (availableSlots === 0) {
      setComposerNotice("最多上传 4 张图片");
      return;
    }

    const selectedFiles = imageFiles.slice(0, availableSlots);
    if (selectedFiles.length < imageFiles.length) {
      setComposerNotice("最多上传 4 张图片");
    } else {
      setComposerNotice(null);
    }

    const nextAttachments = await Promise.all(
      selectedFiles.map(async (file) => {
        const dataUrl = await readFileAsDataUrl(file);
        return {
          id: `${Date.now()}_${file.name}_${Math.random().toString(16).slice(2, 8)}`,
          kind: "image" as const,
          name: file.name,
          mimeType: file.type || "image/*",
          size: file.size,
          previewUrl: dataUrl,
          transportPayload: dataUrl
        } satisfies ChatAttachment;
      })
    );

    setDraftStateForActiveConversation((previous) => ({
      ...previous,
      attachments: [...previous.attachments, ...nextAttachments]
    }));
    setPlusMenuOpen(false);
  };

  const handleComposerImageChange = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    await appendImageAttachments(files);
    event.target.value = "";
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachmentsForActiveConversation(
      draftAttachments.filter((attachment) => attachment.id !== attachmentId)
    );
  };

  const handleComposerPaste = async (
    event: ClipboardEvent<HTMLTextAreaElement>
  ) => {
    const files = Array.from(event.clipboardData?.files ?? []);
    const hasImage = files.some((file) => file.type.startsWith("image/"));
    if (!hasImage) {
      return;
    }

    event.preventDefault();
    await appendImageAttachments(files);
  };

  const handleComposerDragOver = (event: DragEvent<HTMLDivElement>) => {
    const files = Array.from(event.dataTransfer?.files ?? []);
    const hasImage = files.some((file) => file.type.startsWith("image/"));
    if (!hasImage) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    setComposerDragActive(true);
  };

  const handleComposerDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setComposerDragActive(false);
    }
  };

  const handleComposerDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setComposerDragActive(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) {
      return;
    }

    await appendImageAttachments(files);
  };

  const dismissSlashMenu = () => {
    setSlashMenuDismissed(true);
    setSlashSelectedIndex(0);
  };

  const applySlashTemplate = (prompt: string) => {
    setDraftForActiveConversation(prompt);
    setSlashMenuDismissed(false);
    setSlashSelectedIndex(0);
    setPlusMenuOpen(false);
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const applyPlusTemplate = (prompt: string) => {
    const nextDraft = draft.trim() ? `${draft}\n${prompt}` : prompt;
    setDraftForActiveConversation(nextDraft);
    setPlusMenuOpen(false);
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const sendDraft = async () => {
    if ((!draft.trim() && draftAttachments.length === 0) || isSending || slashMenuVisible) {
      return;
    }

    const message = draft.trim();
    const attachmentsToSend = draftAttachments;
    if (attachmentsToSend.length > 0 && !supportsVisionUpload) {
      setComposerNotice(unsupportedVisionNotice);
      setPlusMenuOpen(false);
      return;
    }

    setDraftStateForActiveConversation({
      text: "",
      attachments: []
    });
    setComposerNotice(null);
    setPlusMenuOpen(false);
    setSlashSelectedIndex(0);
    await send({
      content: message,
      attachments: attachmentsToSend
    });
  };

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    await sendDraft();
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMenuVisible && event.key === "ArrowDown") {
      event.preventDefault();
      setSlashSelectedIndex((value) => (value + 1) % slashTemplates.length);
      return;
    }
    if (slashMenuVisible && event.key === "ArrowUp") {
      event.preventDefault();
      setSlashSelectedIndex((value) =>
        value <= 0 ? slashTemplates.length - 1 : value - 1
      );
      return;
    }
    if (event.key === "Escape" && slashMenuVisible) {
      event.preventDefault();
      dismissSlashMenu();
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (slashMenuVisible) {
        const selected =
          slashTemplates[slashSelectedIndex] ?? slashTemplates[0];
        if (selected) {
          applySlashTemplate(selected.prompt);
        }
        return;
      }
      void sendDraft();
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

  const openSettingsDrawer = () => {
    setSettingsOpen(true);
    setMobileActionsOpen(false);
    setPlusMenuOpen(false);
    if (compactViewport) {
      setCompactHistorySheetVisible(false);
    }
  };

  const handleRollbackAction = () => {
    setMobileActionsOpen(false);
    setPlusMenuOpen(false);
    void rollbackLastScene();
  };

  const handleClearSceneAction = () => {
    setMobileActionsOpen(false);
    setPlusMenuOpen(false);
    void clearScene();
  };

  const handleLogoutAction = () => {
    setMobileActionsOpen(false);
    setPlusMenuOpen(false);
    void handleOfficialLogout();
  };

  const handleSelectMobileSurface = (surface: MobileSurface) => {
    setMobileSurface(surface);
    setMobileActionsOpen(false);
    setPlusMenuOpen(false);
    if (surface !== "chat") {
      setCompactHistorySheetVisible(false);
    }
  };

  const handleMobileActionsToggle = () => {
    if (mobileActionsOpen) {
      setMobileActionsOpen(false);
      return;
    }

    setPlusMenuOpen(false);
    setCompactHistorySheetVisible(false);
    setMobileActionsOpen(true);
  };

  const handleHistoryToggle = () => {
    setPlusMenuOpen(false);
    if (compactViewport) {
      setMobileActionsOpen(false);
      setMobileSurface("chat");
      setCompactHistorySheetVisible((value) => !value);
      return;
    }

    toggleHistoryDrawer();
  };

  const handleCreateConversation = () => {
    const nextConversationId = createConversation();
    setDraftByConversationId((state) => ({
      ...state,
      [nextConversationId]: {
        text: "",
        attachments: []
      }
    }));
    setPlusMenuOpen(false);
    setSlashSelectedIndex(0);
    if (compactViewport) {
      setCompactHistorySheetVisible(false);
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    selectConversation(conversationId);
    setPlusMenuOpen(false);
    setSlashSelectedIndex(0);
    if (compactViewport) {
      setCompactHistorySheetVisible(false);
    }
  };

  const conversationSidebarContent = (
    <>
      <div className="conversation-sidebar-header">
        <button
          type="button"
          className="new-conversation-button"
          onClick={handleCreateConversation}
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
            onClick={() => {
              handleSelectConversation(conversation.id);
            }}
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

  return (
    <main
      className={`workspace-shell${
        !compactViewport && !chatVisible ? " chat-collapsed" : ""
      }${compactViewport ? ` mobile-surface-${mobileSurface}` : ""}${compactViewport ? " compact-viewport" : ""}${phoneViewport ? " phone-viewport" : ""}${shortViewport ? " short-viewport" : ""}`}
    >
      <header className="top-bar">
        <div className="top-bar-main">
          <h1>GeoHelper</h1>
          <div className="top-bar-actions">
            <ModelModeSwitcher
              mode={mode}
              officialEnabled={runtimeSupportsOfficial}
              onChange={handleModeChange}
            />
            <span className="runtime-tag">{`运行时：${activeRuntimeProfile?.name ?? runtimeTarget}`}</span>
            {compactViewport ? (
              <>
                <button
                  type="button"
                  className="top-bar-button top-bar-button-secondary"
                  onClick={openSettingsDrawer}
                >
                  设置
                </button>
                <button
                  ref={mobileActionsButtonRef}
                  type="button"
                  className="top-bar-button top-bar-button-ghost top-bar-more-button"
                  data-testid="mobile-more-button"
                  onClick={handleMobileActionsToggle}
                >
                  更多
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="top-bar-button top-bar-button-secondary"
                  onClick={openSettingsDrawer}
                >
                  设置
                </button>
                <button
                  type="button"
                  className="top-bar-button top-bar-button-secondary"
                  disabled={
                    isSending || isSceneRollingBack || sceneTransactionCount === 0
                  }
                  onClick={handleRollbackAction}
                >
                  回滚上一步
                </button>
                <button
                  type="button"
                  className="top-bar-button top-bar-button-danger"
                  disabled={isSending || isSceneRollingBack}
                  onClick={handleClearSceneAction}
                >
                  清空画布
                </button>
                {mode === "official" && sessionToken && runtimeSupportsOfficial ? (
                  <button
                    type="button"
                    className="top-bar-button top-bar-button-ghost"
                    onClick={handleLogoutAction}
                  >
                    退出官方会话
                  </button>
                ) : null}
                <button
                  type="button"
                  className="top-bar-button top-bar-button-ghost"
                  onClick={toggleChat}
                >
                  {chatVisible ? "收起对话" : "显示对话"}
                </button>
              </>
            )}
          </div>
        </div>
        {compactViewport ? (
          <>
            <div
              className="mobile-surface-switcher"
              data-testid="mobile-surface-switcher"
            >
              <button
                type="button"
                data-testid="mobile-surface-canvas"
                className={`mobile-surface-button${
                  mobileSurface === "canvas" ? " mobile-surface-button-active" : ""
                }`}
                aria-pressed={mobileSurface === "canvas"}
                onClick={() => handleSelectMobileSurface("canvas")}
              >
                画布
              </button>
              <button
                type="button"
                data-testid="mobile-surface-chat"
                className={`mobile-surface-button${
                  mobileSurface === "chat" ? " mobile-surface-button-active" : ""
                }`}
                aria-pressed={mobileSurface === "chat"}
                onClick={() => handleSelectMobileSurface("chat")}
              >
                对话
              </button>
            </div>
            {mobileActionsOpen ? (
              <div
                ref={mobileActionsMenuRef}
                className="top-bar-overflow-menu"
                data-testid="mobile-overflow-menu"
              >
                <button
                  type="button"
                  disabled={
                    isSending || isSceneRollingBack || sceneTransactionCount === 0
                  }
                  onClick={handleRollbackAction}
                >
                  回滚上一步
                </button>
                <button
                  type="button"
                  disabled={isSending || isSceneRollingBack}
                  onClick={handleClearSceneAction}
                >
                  清空画布
                </button>
                {mode === "official" && sessionToken && runtimeSupportsOfficial ? (
                  <button type="button" onClick={handleLogoutAction}>
                    退出官方会话
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </header>
      <div className="workspace-content">
        <CanvasPanel
          key={canvasMountKey}
          profile={canvasProfile}
          visible={canvasVisible}
        />
        <ChatPanel visible={effectiveChatVisible}>
          <div
            ref={chatShellRef}
            className={`chat-shell${desktopHistoryOverlay ? " history-overlay-mode" : ""}`}
          >
            {!compactViewport ? (
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
            ) : null}
            <div className="chat-body">
              <div className="chat-thread-header">
                <h3>{activeConversation?.title ?? "新会话"}</h3>
                <div className="chat-thread-actions">
                  <span className="scene-transaction-count">
                    事务数: {sceneTransactionCount}
                  </span>
                  <button
                    type="button"
                    className="history-toggle-button"
                    data-testid="history-toggle-button"
                    onClick={handleHistoryToggle}
                  >
                    {effectiveHistoryDrawerVisible ? "收起历史" : "历史"}
                  </button>
                </div>
              </div>
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
                              onClick={() => applySlashTemplate(template.prompt)}
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
                            onClick={() => applySlashTemplate(template.prompt)}
                          >
                            {template.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                ) : (
                  messages.map((message) => (
                    <article
                      key={message.id}
                      className={`chat-message chat-message-${message.role}`}
                    >
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
                                <span className="agent-step-status">
                                  {step.status}
                                </span>
                                <span className="agent-step-time">
                                  {step.duration_ms}ms
                                </span>
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
              <form ref={composerFormRef} className="chat-composer" onSubmit={handleSend}>
                <span className="chat-composer-hint">输入 / 调用模板命令</span>

                {plusMenuOpen ? (
                  <div
                    ref={plusMenuRef}
                    className="plus-menu"
                    data-testid="plus-menu"
                  >
                    <button
                      type="button"
                      className="plus-menu-item"
                      disabled={!supportsVisionUpload}
                      onClick={() => imageInputRef.current?.click()}
                    >
                      上传图片
                    </button>
                    {templates.slice(0, 8).map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        className="plus-menu-item"
                        onClick={() => applyPlusTemplate(template.prompt)}
                      >
                        {template.title}
                      </button>
                    ))}
                    {!supportsVisionUpload ? (
                      <div className="plus-menu-note">{unsupportedVisionNotice}</div>
                    ) : null}
                  </div>
                ) : null}

                {draftAttachments.length > 0 ? (
                  <div className="composer-attachment-tray">
                    {draftAttachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="composer-attachment-item"
                        data-testid="composer-attachment-item"
                      >
                        <img
                          src={attachment.previewUrl ?? attachment.transportPayload}
                          alt={attachment.name}
                        />
                        <span>{attachment.name}</span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(attachment.id)}
                        >
                          移除
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                {composerNotice ? (
                  <div className="chat-composer-notice">{composerNotice}</div>
                ) : null}

                {slashMenuVisible ? (
                  <div className="slash-command-menu" data-testid="slash-command-menu">
                    {slashTemplates.map((template, index) => (
                      <button
                        key={template.id}
                        type="button"
                        data-testid="slash-command-item"
                        className={`slash-command-item${
                          index === slashSelectedIndex
                            ? " slash-command-item-active"
                            : ""
                        }`}
                        onMouseEnter={() => setSlashSelectedIndex(index)}
                        onClick={() => applySlashTemplate(template.prompt)}
                      >
                        <span className="slash-command-label">{`/${template.title}`}</span>
                        <span className="slash-command-preview">
                          {template.prompt}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <div
                  className={`chat-composer-input-shell${
                    composerDragActive ? " chat-composer-input-shell-drag-active" : ""
                  }`}
                  data-testid="chat-composer-shell"
                  onDragOver={handleComposerDragOver}
                  onDragLeave={handleComposerDragLeave}
                  onDrop={(event) => {
                    void handleComposerDrop(event);
                  }}
                >
                  <button
                    ref={plusMenuButtonRef}
                    type="button"
                    className="plus-menu-button"
                    data-testid="plus-menu-button"
                    onClick={() => {
                      setPlusMenuOpen((value) => !value);
                      setSlashSelectedIndex(0);
                    }}
                  >
                    +
                  </button>
                  <textarea
                    ref={composerRef}
                    data-testid="chat-composer-input"
                    value={draft}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setDraftForActiveConversation(nextValue);
                      setSlashMenuDismissed(false);
                      if (!nextValue.startsWith("/")) {
                        setSlashSelectedIndex(0);
                      } else {
                        setPlusMenuOpen(false);
                      }
                    }}
                    onFocus={() => {
                      if (draft.startsWith("/")) {
                        setSlashMenuDismissed(false);
                      }
                    }}
                    onKeyDown={handleComposerKeyDown}
                    onPaste={(event) => {
                      void handleComposerPaste(event);
                    }}
                    placeholder="例如：过点A和B作垂直平分线"
                    rows={2}
                  />
                  <button
                    type="submit"
                    disabled={
                      isSending ||
                      (draftAttachments.length === 0 && !draft.trim()) ||
                      slashMenuVisible
                    }
                  >
                    {isSending ? "生成中..." : "发送"}
                  </button>
                </div>
                <input
                  ref={imageInputRef}
                  data-testid="composer-image-input"
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(event) => {
                    void handleComposerImageChange(event);
                  }}
                />
              </form>
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
      </div>
      <TokenGateDialog
        open={tokenDialogOpen && runtimeSupportsOfficial}
        onClose={() => setTokenDialogOpen(false)}
        onSubmit={async (token) => {
          const result = await loginWithRuntime({
            target: runtimeTarget,
            baseUrl: runtimeBaseUrl,
            token,
            deviceId
          });
          setSessionToken(result.session_token);
          setTokenDialogOpen(false);
        }}
      />
      <SettingsDrawer
        open={settingsOpen}
        activeConversationId={activeConversationId}
        currentMode={mode}
        onClose={() => setSettingsOpen(false)}
        onApplyMode={setMode}
      />
    </main>
  );
};
