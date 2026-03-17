import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useMemo,
  useState
} from "react";

import { resolveRuntimeCapabilities } from "../../runtime/runtime-service";
import { type ChatMode } from "../../runtime/types";
import { type ChatAttachment, useChatStore } from "../../state/chat-store";
import {
  resolveRuntimeCapabilitiesForModel,
  useSettingsStore
} from "../../state/settings-store";
import { useTemplateStore } from "../../state/template-store";
import { readFileAsDataUrl } from "./file-utils";

interface ComposerDraftState {
  text: string;
  attachments: ChatAttachment[];
}

interface UseWorkspaceComposerInput {
  composerRef: RefObject<HTMLTextAreaElement | null>;
  mode: ChatMode;
  phoneViewport: boolean;
  runtimeBaseUrl?: string;
  runtimeTarget: "direct" | "gateway";
}

const EMPTY_COMPOSER_DRAFT: ComposerDraftState = {
  text: "",
  attachments: []
};

export const useWorkspaceComposer = ({
  composerRef,
  mode,
  phoneViewport,
  runtimeBaseUrl,
  runtimeTarget
}: UseWorkspaceComposerInput) => {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore(
    (state) => state.activeConversationId
  );
  const messages = useChatStore((state) => state.messages);
  const isSending = useChatStore((state) => state.isSending);
  const send = useChatStore((state) => state.send);
  const sendFollowUpPrompt = useChatStore((state) => state.sendFollowUpPrompt);
  const createConversation = useChatStore((state) => state.createConversation);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const templates = useTemplateStore((state) => state.templates);
  const byokPresets = useSettingsStore((state) => state.byokPresets);
  const officialPresets = useSettingsStore((state) => state.officialPresets);
  const defaultByokPresetId = useSettingsStore(
    (state) => state.defaultByokPresetId
  );
  const defaultOfficialPresetId = useSettingsStore(
    (state) => state.defaultOfficialPresetId
  );
  const sessionOverrides = useSettingsStore((state) => state.sessionOverrides);

  const [draftByConversationId, setDraftByConversationId] = useState<
    Record<string, ComposerDraftState>
  >({});
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [slashMenuDismissed, setSlashMenuDismissed] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const [composerDragActive, setComposerDragActive] = useState(false);

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

  useEffect(() => {
    if (slashSelectedIndex >= slashTemplates.length) {
      setSlashSelectedIndex(0);
    }
  }, [slashSelectedIndex, slashTemplates.length]);

  useEffect(() => {
    setSlashMenuDismissed(false);
    setSlashSelectedIndex(0);
  }, [activeConversationKey]);

  const setDraftStateForActiveConversation = (
    updater:
      | ComposerDraftState
      | ((previous: ComposerDraftState) => ComposerDraftState)
  ) => {
    setDraftByConversationId((state) => {
      const previous = state[activeConversationKey] ?? EMPTY_COMPOSER_DRAFT;
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

  const closeComposerMenus = () => {
    setPlusMenuOpen(false);
    dismissSlashMenu();
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

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
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

  const handleDraftChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    setDraftForActiveConversation(nextValue);
    setSlashMenuDismissed(false);
    if (!nextValue.startsWith("/")) {
      setSlashSelectedIndex(0);
    } else {
      setPlusMenuOpen(false);
    }
  };

  const handleComposerFocus = () => {
    if (draft.startsWith("/")) {
      setSlashMenuDismissed(false);
    }
  };

  const createConversationWithComposerState = () => {
    const nextConversationId = createConversation();
    setDraftByConversationId((state) => ({
      ...state,
      [nextConversationId]: EMPTY_COMPOSER_DRAFT
    }));
    closeComposerMenus();
    return nextConversationId;
  };

  const selectConversationWithComposerState = (conversationId: string) => {
    selectConversation(conversationId);
    closeComposerMenus();
  };

  const retryLatestPrompt = async () => {
    const latestUserMessage =
      [...messages].reverse().find((message) => message.role === "user") ?? null;
    if (!latestUserMessage) {
      return;
    }

    await send({
      content: latestUserMessage.content,
      attachments: latestUserMessage.attachments
    });
  };

  return {
    activeConversation,
    activeConversationId,
    closeComposerMenus,
    compactEmptyStateTemplates,
    composerDragActive,
    composerNotice,
    conversations,
    createConversationWithComposerState,
    draft,
    draftAttachments,
    handleComposerDragLeave,
    handleComposerDragOver,
    handleComposerDrop,
    handleComposerFocus,
    handleComposerImageChange,
    handleComposerKeyDown,
    handleComposerPaste,
    handleDraftChange,
    handleSend,
    isSending,
    latestAssistantMessage,
    messages,
    plusMenuOpen,
    removeAttachment,
    retryLatestPrompt,
    selectConversationWithComposerState,
    sendFollowUpPrompt,
    setDraftForActiveConversation,
    setPlusMenuOpen,
    setSlashSelectedIndex,
    slashMenuVisible,
    slashSelectedIndex,
    slashTemplates,
    supportsVisionUpload,
    templates,
    togglePlusMenu: () => {
      setPlusMenuOpen((value) => !value);
      setSlashSelectedIndex(0);
    },
    applyPlusTemplate,
    applySlashTemplate,
    unsupportedVisionNotice
  };
};
