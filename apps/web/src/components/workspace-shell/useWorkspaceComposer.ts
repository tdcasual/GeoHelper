import {
  type ChangeEvent,
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
import { resolveUncertaintyRepairPrompt } from "../proof-assist-actions";
import { useComposerAttachments } from "./useComposerAttachments";

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
  const updateUncertaintyReviewStatus = useChatStore(
    (state) => state.updateUncertaintyReviewStatus
  );
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

  const {
    composerNotice,
    composerDragActive,
    handleComposerImageChange,
    handleComposerPaste,
    handleComposerDragOver,
    handleComposerDragLeave,
    handleComposerDrop,
    removeAttachment,
    setComposerNotice
  } = useComposerAttachments({
    draftAttachments,
    supportsVisionUpload,
    unsupportedVisionNotice,
    setPlusMenuOpen,
    setDraftStateForActiveConversation,
    setAttachmentsForActiveConversation
  });

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

  const confirmUncertainty = (uncertaintyId: string) => {
    if (!latestAssistantMessage?.id) {
      return;
    }

    updateUncertaintyReviewStatus({
      messageId: latestAssistantMessage.id,
      uncertaintyId,
      reviewStatus: "confirmed"
    });
  };

  const repairUncertainty = async (uncertaintyId: string) => {
    if (!latestAssistantMessage?.id) {
      return;
    }

    const prompt = resolveUncertaintyRepairPrompt(
      latestAssistantMessage,
      uncertaintyId
    );
    updateUncertaintyReviewStatus({
      messageId: latestAssistantMessage.id,
      uncertaintyId,
      reviewStatus: "needs_fix"
    });
    if (prompt) {
      await sendFollowUpPrompt(prompt);
    }
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
    confirmUncertainty,
    repairUncertainty,
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
