import type {
  ChangeEvent,
  ClipboardEvent,
  ComponentProps,
  DragEvent,
  RefObject
} from "react";

import { useWorkspaceComposer } from "./useWorkspaceComposer";
import { useWorkspaceRuntimeSession } from "./useWorkspaceRuntimeSession";
import { WorkspaceChatComposer } from "./WorkspaceChatComposer";
import { WorkspaceChatHeader } from "./WorkspaceChatHeader";
import { WorkspaceChatMessages } from "./WorkspaceChatMessages";
import { WorkspaceConversationSidebar } from "./WorkspaceConversationSidebar";

type WorkspaceComposerController = ReturnType<typeof useWorkspaceComposer>;
type WorkspaceRuntimeSessionController = ReturnType<
  typeof useWorkspaceRuntimeSession
>;

interface BuildWorkspaceLayoutPropsInput {
  composer: WorkspaceComposerController;
  compactViewport: boolean;
  showAgentSteps: boolean;
  sceneTransactionCount: number;
  effectiveHistoryDrawerVisible: boolean;
  runtimeMode: WorkspaceRuntimeSessionController["mode"];
  sessionToken: WorkspaceRuntimeSessionController["sessionToken"];
  onToggleHistory: () => void;
  onCreateConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
  composerFormRef: RefObject<HTMLFormElement | null>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  imageInputRef: RefObject<HTMLInputElement | null>;
  plusMenuButtonRef: RefObject<HTMLButtonElement | null>;
  plusMenuRef: RefObject<HTMLDivElement | null>;
}

export const buildWorkspaceLayoutProps = ({
  composer,
  compactViewport,
  showAgentSteps,
  sceneTransactionCount,
  effectiveHistoryDrawerVisible,
  runtimeMode,
  sessionToken,
  onToggleHistory,
  onCreateConversation,
  onSelectConversation,
  composerFormRef,
  composerRef,
  imageInputRef,
  plusMenuButtonRef,
  plusMenuRef
}: BuildWorkspaceLayoutPropsInput) => {
  const conversationSidebarProps: ComponentProps<
    typeof WorkspaceConversationSidebar
  > = {
    conversations: composer.conversations,
    activeConversationId: composer.activeConversationId,
    onCreateConversation,
    onSelectConversation
  };

  const chatHeaderProps: ComponentProps<typeof WorkspaceChatHeader> = {
    title: composer.activeConversation?.title ?? "新会话",
    sceneTransactionCount,
    historyOpen: effectiveHistoryDrawerVisible,
    onToggleHistory
  };

  const chatMessagesProps: ComponentProps<typeof WorkspaceChatMessages> = {
    messages: composer.messages,
    compactViewport,
    compactEmptyStateTemplates: composer.compactEmptyStateTemplates,
    templates: composer.templates,
    showAgentSteps,
    mode: runtimeMode,
    sessionToken,
    onApplyTemplate: composer.applySlashTemplate
  };

  const chatComposerProps: ComponentProps<typeof WorkspaceChatComposer> = {
    composerFormRef,
    composerRef,
    imageInputRef,
    plusMenuButtonRef,
    plusMenuRef,
    plusMenuOpen: composer.plusMenuOpen,
    supportsVisionUpload: composer.supportsVisionUpload,
    templates: composer.templates,
    unsupportedVisionNotice: composer.unsupportedVisionNotice,
    draftAttachments: composer.draftAttachments,
    composerNotice: composer.composerNotice,
    slashMenuVisible: composer.slashMenuVisible,
    slashTemplates: composer.slashTemplates,
    slashSelectedIndex: composer.slashSelectedIndex,
    composerDragActive: composer.composerDragActive,
    draft: composer.draft,
    isSending: composer.isSending,
    onSubmit: composer.handleSend,
    onTogglePlusMenu: composer.togglePlusMenu,
    onApplyPlusTemplate: composer.applyPlusTemplate,
    onRemoveAttachment: composer.removeAttachment,
    onSetSlashSelectedIndex: composer.setSlashSelectedIndex,
    onApplySlashTemplate: composer.applySlashTemplate,
    onDragOver: composer.handleComposerDragOver,
    onDragLeave: composer.handleComposerDragLeave,
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      void composer.handleComposerDrop(event);
    },
    onDraftChange: composer.handleDraftChange,
    onComposerFocus: composer.handleComposerFocus,
    onKeyDown: composer.handleComposerKeyDown,
    onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => {
      void composer.handleComposerPaste(event);
    },
    onImageChange: (event: ChangeEvent<HTMLInputElement>) => {
      void composer.handleComposerImageChange(event);
    }
  };

  return {
    conversationSidebarProps,
    chatHeaderProps,
    chatMessagesProps,
    chatComposerProps,
    recentConversations: composer.conversations.slice(0, 3).map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
      isActive: conversation.id === composer.activeConversationId
    })),
    recentTemplates: composer.templates.slice(0, 3),
    currentConversationTitle: composer.activeConversation?.title ?? "新会话"
  };
};
