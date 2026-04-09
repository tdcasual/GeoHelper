import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceDesktopLayout } from "./WorkspaceDesktopLayout";

const createProps = (): ComponentProps<typeof WorkspaceDesktopLayout> => ({
  chatVisible: true,
  chatShellRef: { current: null },
  desktopHistoryOverlay: true,
  historyDrawerVisible: true,
  historyDrawerStyle: { width: 280 },
  onHistoryResizeStart: vi.fn(),
  conversationSidebarProps: {
    conversations: [
      {
        id: "conv_1",
        title: "三角形辅助线",
        createdAt: 1,
        updatedAt: 1,
        messages: []
      }
    ],
    activeConversationId: "conv_1",
    onCreateConversation: vi.fn(),
    onSelectConversation: vi.fn()
  },
  templateLibraryOpen: false,
  templateLibraryTemplates: [],
  onApplyTemplateLibrary: vi.fn(),
  onCloseTemplateLibrary: vi.fn(),
  desktopInputMode: "image",
  onDesktopInputModeChange: vi.fn(),
  currentConversationTitle: "三角形辅助线",
  recentConversations: [
    {
      id: "conv_1",
      title: "三角形辅助线",
      updatedAt: 1,
      isActive: true
    }
  ],
  recentTemplates: [],
  onContinueCurrent: vi.fn(),
  onSelectConversation: vi.fn(),
  onApplyContinueTemplate: vi.fn(),
  onOpenTemplateLibrary: vi.fn(),
  chatHeaderProps: {
    title: "三角形辅助线",
    sceneTransactionCount: 2,
    historyOpen: true,
    onToggleHistory: vi.fn()
  },
  chatComposerProps: {
    composerFormRef: { current: null },
    composerRef: { current: null },
    imageInputRef: { current: null },
    plusMenuButtonRef: { current: null },
    plusMenuRef: { current: null },
    plusMenuOpen: false,
    supportsVisionUpload: true,
    templates: [],
    unsupportedVisionNotice: "",
    draftAttachments: [],
    composerNotice: null,
    slashMenuVisible: false,
    slashTemplates: [],
    slashSelectedIndex: 0,
    composerDragActive: false,
    draft: "",
    isSending: false,
    onSubmit: vi.fn(),
    onTogglePlusMenu: vi.fn(),
    onApplyPlusTemplate: vi.fn(),
    onRemoveAttachment: vi.fn(),
    onSetSlashSelectedIndex: vi.fn(),
    onApplySlashTemplate: vi.fn(),
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDrop: vi.fn(),
    onDraftChange: vi.fn(),
    onComposerFocus: vi.fn(),
    onKeyDown: vi.fn(),
    onPaste: vi.fn(),
    onImageChange: vi.fn()
  },
  canvasMountKey: "desktop-regular",
  canvasProfile: "desktop",
  canvasVisible: true,
  canvasFocusNotice: null,
  latestAssistantMessage: null,
  onStudioResultAction: vi.fn(),
  onRetryLatestPrompt: vi.fn(),
  onConfirmLatestUncertainty: vi.fn(),
  onRepairLatestUncertainty: vi.fn(),
  onFocusLatestUncertainty: vi.fn(),
  activeFocusUncertaintyId: null,
  chatMessagesProps: {
    messages: [],
    compactViewport: false,
    compactEmptyStateTemplates: [],
    templates: [],
    showAgentSteps: true,
    mode: "byok",
    sessionToken: null,
    onApplyTemplate: vi.fn()
  }
});

describe("WorkspaceDesktopLayout", () => {
  it("renders a stable left canvas rail and right conversation shell", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceDesktopLayout, createProps())
    );

    expect(markup).toContain('data-testid="workspace-desktop-layout"');
    expect(markup).toContain('data-testid="workspace-canvas-rail"');
    expect(markup).toContain('data-testid="workspace-conversation-shell"');
    expect(markup).toContain('data-testid="workspace-history-overlay"');
    expect(markup).toContain('data-testid="workspace-dialog-thread"');
    expect(markup.indexOf('data-testid="workspace-canvas-rail"')).toBeLessThan(
      markup.indexOf('data-testid="workspace-conversation-shell"')
    );
    expect(
      markup.indexOf('data-testid="workspace-history-overlay"')
    ).toBeGreaterThan(markup.indexOf('data-testid="workspace-conversation-shell"'));
    expect(markup).not.toContain('data-testid="history-resizer"');
  });
});
