import type {
  ChangeEventHandler,
  ClipboardEventHandler,
  DragEventHandler,
  FormEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  RefObject
} from "react";

import type { ChatAttachment } from "../../state/chat-store";
import type { PromptTemplate } from "../../state/template-store";

interface WorkspaceChatComposerProps {
  composerFormRef: RefObject<HTMLFormElement | null>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  imageInputRef: RefObject<HTMLInputElement | null>;
  plusMenuButtonRef: RefObject<HTMLButtonElement | null>;
  plusMenuRef: RefObject<HTMLDivElement | null>;
  plusMenuOpen: boolean;
  supportsVisionUpload: boolean;
  templates: PromptTemplate[];
  unsupportedVisionNotice: string;
  draftAttachments: ChatAttachment[];
  composerNotice: string | null;
  slashMenuVisible: boolean;
  slashTemplates: PromptTemplate[];
  slashSelectedIndex: number;
  composerDragActive: boolean;
  draft: string;
  isSending: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onTogglePlusMenu: MouseEventHandler<HTMLButtonElement>;
  onApplyPlusTemplate: (prompt: string) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onSetSlashSelectedIndex: (index: number) => void;
  onApplySlashTemplate: (prompt: string) => void;
  onDragOver: DragEventHandler<HTMLDivElement>;
  onDragLeave: DragEventHandler<HTMLDivElement>;
  onDrop: DragEventHandler<HTMLDivElement>;
  onDraftChange: ChangeEventHandler<HTMLTextAreaElement>;
  onComposerFocus: () => void;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>;
  onImageChange: ChangeEventHandler<HTMLInputElement>;
}

export const WorkspaceChatComposer = ({
  composerFormRef,
  composerRef,
  imageInputRef,
  plusMenuButtonRef,
  plusMenuRef,
  plusMenuOpen,
  supportsVisionUpload,
  templates,
  unsupportedVisionNotice,
  draftAttachments,
  composerNotice,
  slashMenuVisible,
  slashTemplates,
  slashSelectedIndex,
  composerDragActive,
  draft,
  isSending,
  onSubmit,
  onTogglePlusMenu,
  onApplyPlusTemplate,
  onRemoveAttachment,
  onSetSlashSelectedIndex,
  onApplySlashTemplate,
  onDragOver,
  onDragLeave,
  onDrop,
  onDraftChange,
  onComposerFocus,
  onKeyDown,
  onPaste,
  onImageChange
}: WorkspaceChatComposerProps) => (
  <form ref={composerFormRef} className="chat-composer" onSubmit={onSubmit}>
    <span className="chat-composer-hint">输入 / 调用模板命令</span>

    {plusMenuOpen ? (
      <div ref={plusMenuRef} className="plus-menu" data-testid="plus-menu">
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
            onClick={() => onApplyPlusTemplate(template.prompt)}
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
            <button type="button" onClick={() => onRemoveAttachment(attachment.id)}>
              移除
            </button>
          </div>
        ))}
      </div>
    ) : null}

    {composerNotice ? <div className="chat-composer-notice">{composerNotice}</div> : null}

    {slashMenuVisible ? (
      <div className="slash-command-menu" data-testid="slash-command-menu">
        {slashTemplates.map((template, index) => (
          <button
            key={template.id}
            type="button"
            data-testid="slash-command-item"
            className={`slash-command-item${
              index === slashSelectedIndex ? " slash-command-item-active" : ""
            }`}
            onMouseEnter={() => onSetSlashSelectedIndex(index)}
            onClick={() => onApplySlashTemplate(template.prompt)}
          >
            <span className="slash-command-label">{`/${template.title}`}</span>
            <span className="slash-command-preview">{template.prompt}</span>
          </button>
        ))}
      </div>
    ) : null}

    <div
      className={`chat-composer-input-shell${
        composerDragActive ? " chat-composer-input-shell-drag-active" : ""
      }`}
      data-testid="chat-composer-shell"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <button
        ref={plusMenuButtonRef}
        type="button"
        className="plus-menu-button"
        data-testid="plus-menu-button"
        onClick={onTogglePlusMenu}
      >
        +
      </button>
      <textarea
        ref={composerRef}
        data-testid="chat-composer-input"
        value={draft}
        onChange={onDraftChange}
        onFocus={onComposerFocus}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
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
      onChange={onImageChange}
    />
  </form>
);
