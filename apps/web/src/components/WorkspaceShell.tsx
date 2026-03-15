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
import { type StudioStartMode } from "../state/studio-start";
import { useTemplateStore } from "../state/template-store";
import { useUIStore } from "../state/ui-store";
import { CanvasPanel } from "./CanvasPanel";
import { ChatPanel } from "./ChatPanel";
import { SettingsDrawer } from "./SettingsDrawer";
import { StudioInputPanel } from "./StudioInputPanel";
import { StudioResultPanel } from "./StudioResultPanel";
import { TeacherTemplateLibrary } from "./TeacherTemplateLibrary";
import { TokenGateDialog } from "./TokenGateDialog";
import { readFileAsDataUrl } from "./workspace-shell/file-utils";
import { WorkspaceChatComposer } from "./workspace-shell/WorkspaceChatComposer";
import { WorkspaceChatHeader } from "./workspace-shell/WorkspaceChatHeader";
import { WorkspaceChatMessages } from "./workspace-shell/WorkspaceChatMessages";
import { WorkspaceConversationSidebar } from "./workspace-shell/WorkspaceConversationSidebar";
import { WorkspaceTopBar } from "./workspace-shell/WorkspaceTopBar";

interface ComposerDraftState {
  text: string;
  attachments: ChatAttachment[];
}

const EMPTY_COMPOSER_DRAFT: ComposerDraftState = {
  text: "",
  attachments: []
};

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
  const sendFollowUpPrompt = useChatStore((state) => state.sendFollowUpPrompt);
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
  const [desktopInputMode, setDesktopInputMode] =
    useState<StudioStartMode>(initialDesktopInputMode);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(
    initialTemplateLibraryOpen
  );
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
  const latestAssistantMessage =
    [...messages].reverse().find((message) => message.role === "assistant") ?? null;
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
    <WorkspaceConversationSidebar
      conversations={conversations}
      activeConversationId={activeConversationId}
      onCreateConversation={handleCreateConversation}
      onSelectConversation={handleSelectConversation}
    />
  );

  useEffect(() => {
    setDesktopInputMode(initialDesktopInputMode);
  }, [initialDesktopInputMode]);

  useEffect(() => {
    setTemplateLibraryOpen(initialTemplateLibraryOpen);
  }, [initialTemplateLibraryOpen]);

  useEffect(() => {
    onTemplateLibraryOpenChange?.(templateLibraryOpen);
  }, [onTemplateLibraryOpenChange, templateLibraryOpen]);

  const chatThreadHeader = (
    <WorkspaceChatHeader
      title={activeConversation?.title ?? "新会话"}
      sceneTransactionCount={sceneTransactionCount}
      historyOpen={effectiveHistoryDrawerVisible}
      onToggleHistory={handleHistoryToggle}
    />
  );

  const chatMessagesContent = (
    <WorkspaceChatMessages
      messages={messages}
      compactViewport={compactViewport}
      compactEmptyStateTemplates={compactEmptyStateTemplates}
      templates={templates}
      showAgentSteps={showAgentSteps}
      mode={mode}
      sessionToken={sessionToken}
      onApplyTemplate={applySlashTemplate}
    />
  );

  const composerContent = (
    <WorkspaceChatComposer
      composerFormRef={composerFormRef}
      composerRef={composerRef}
      imageInputRef={imageInputRef}
      plusMenuButtonRef={plusMenuButtonRef}
      plusMenuRef={plusMenuRef}
      plusMenuOpen={plusMenuOpen}
      supportsVisionUpload={supportsVisionUpload}
      templates={templates}
      unsupportedVisionNotice={unsupportedVisionNotice}
      draftAttachments={draftAttachments}
      composerNotice={composerNotice}
      slashMenuVisible={slashMenuVisible}
      slashTemplates={slashTemplates}
      slashSelectedIndex={slashSelectedIndex}
      composerDragActive={composerDragActive}
      draft={draft}
      isSending={isSending}
      onSubmit={handleSend}
      onTogglePlusMenu={() => {
        setPlusMenuOpen((value) => !value);
        setSlashSelectedIndex(0);
      }}
      onApplyPlusTemplate={applyPlusTemplate}
      onRemoveAttachment={removeAttachment}
      onSetSlashSelectedIndex={setSlashSelectedIndex}
      onApplySlashTemplate={applySlashTemplate}
      onDragOver={handleComposerDragOver}
      onDragLeave={handleComposerDragLeave}
      onDrop={(event) => {
        void handleComposerDrop(event);
      }}
      onDraftChange={(event) => {
        const nextValue = event.target.value;
        setDraftForActiveConversation(nextValue);
        setSlashMenuDismissed(false);
        if (!nextValue.startsWith("/")) {
          setSlashSelectedIndex(0);
        } else {
          setPlusMenuOpen(false);
        }
      }}
      onComposerFocus={() => {
        if (draft.startsWith("/")) {
          setSlashMenuDismissed(false);
        }
      }}
      onKeyDown={handleComposerKeyDown}
      onPaste={(event) => {
        void handleComposerPaste(event);
      }}
      onImageChange={(event) => {
        void handleComposerImageChange(event);
      }}
    />
  );

  return (
    <main
      className={`workspace-shell${
        !compactViewport && !chatVisible ? " chat-collapsed" : ""
      }${compactViewport ? ` mobile-surface-${mobileSurface}` : ""}${compactViewport ? " compact-viewport" : ""}${phoneViewport ? " phone-viewport" : ""}${shortViewport ? " short-viewport" : ""}`}
    >
      <WorkspaceTopBar
        mode={mode}
        runtimeSupportsOfficial={runtimeSupportsOfficial}
        activeRuntimeLabel={`运行时：${activeRuntimeProfile?.name ?? runtimeTarget}`}
        compactViewport={compactViewport}
        mobileActionsButtonRef={mobileActionsButtonRef}
        mobileActionsMenuRef={mobileActionsMenuRef}
        mobileActionsOpen={mobileActionsOpen}
        mobileSurface={mobileSurface}
        isSending={isSending}
        isSceneRollingBack={isSceneRollingBack}
        sceneTransactionCount={sceneTransactionCount}
        sessionToken={sessionToken}
        chatVisible={chatVisible}
        onModeChange={handleModeChange}
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
                className={`chat-shell${desktopHistoryOverlay ? " history-overlay-mode" : ""}`}
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
                    templates={templates}
                    onApply={(prompt) => {
                      setDraftForActiveConversation(prompt);
                      composerRef.current?.focus();
                    }}
                    onClose={() => setTemplateLibraryOpen(false)}
                  />
                  <StudioInputPanel
                    mode={desktopInputMode}
                    onModeChange={setDesktopInputMode}
                    conversationCount={conversations.length}
                    templateCount={templates.length}
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
                  message={latestAssistantMessage}
                  onAction={sendFollowUpPrompt}
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
                className={`chat-shell${desktopHistoryOverlay ? " history-overlay-mode" : ""}`}
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
