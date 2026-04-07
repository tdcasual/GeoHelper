import { ReactNode } from "react";

import type { StudioStartMode } from "../state/studio-start";
import type { PromptTemplate } from "../state/template-store";
import { StudioContinuePanel } from "./StudioContinuePanel";

interface StudioInputConversationItem {
  id: string;
  title: string;
  updatedAt: number;
  isActive: boolean;
}

interface StudioInputPanelProps {
  mode: StudioStartMode;
  onModeChange: (mode: StudioStartMode) => void;
  currentConversationTitle: string;
  recentConversations: StudioInputConversationItem[];
  recentTemplates: PromptTemplate[];
  onContinueCurrent: () => void;
  onSelectConversation: (conversationId: string) => void;
  onApplyTemplate: (prompt: string) => void;
  onOpenTemplateLibrary: () => void;
  headerSlot: ReactNode;
  composerSlot: ReactNode;
}

export const StudioInputPanel = ({
  mode,
  onModeChange,
  currentConversationTitle,
  recentConversations,
  recentTemplates,
  onContinueCurrent,
  onSelectConversation,
  onApplyTemplate,
  onOpenTemplateLibrary,
  headerSlot,
  composerSlot
}: StudioInputPanelProps) => (
  <div className="studio-input-panel">
    {headerSlot}

    <div className="studio-input-mode-switcher">
      <button
        type="button"
        data-testid="studio-input-mode-image"
        className={`studio-input-mode-button${
          mode === "image" ? " studio-input-mode-button-active" : ""
        }`}
        aria-pressed={mode === "image"}
        onClick={() => onModeChange("image")}
      >
        看图生成
      </button>
      <button
        type="button"
        data-testid="studio-input-mode-text"
        className={`studio-input-mode-button${
          mode === "text" ? " studio-input-mode-button-active" : ""
        }`}
        aria-pressed={mode === "text"}
        onClick={() => onModeChange("text")}
      >
        文字生成
      </button>
      <button
        type="button"
        data-testid="studio-input-mode-continue"
        className={`studio-input-mode-button${
          mode === "continue" ? " studio-input-mode-button-active" : ""
        }`}
        aria-pressed={mode === "continue"}
        onClick={() => onModeChange("continue")}
      >
        继续补图
      </button>
    </div>

    {mode === "image" ? (
      <section className="studio-input-mode-panel" data-testid="studio-image-mode-panel">
        <strong>拖入题目截图</strong>
        <p>支持拖拽、粘贴和图片上传，把纸面题快速转成可编辑图形。</p>
      </section>
    ) : null}

    {mode === "text" ? (
      <section className="studio-input-mode-panel" data-testid="studio-text-mode-panel">
        <strong>输入题干或作图要求</strong>
        <p>先用文字描述关系，再用下方 composer 继续补充约束和细节。</p>
      </section>
    ) : null}

    {mode === "continue" ? (
      <StudioContinuePanel
        currentConversationTitle={currentConversationTitle}
        recentConversations={recentConversations}
        recentTemplates={recentTemplates}
        onContinueCurrent={onContinueCurrent}
        onSelectConversation={onSelectConversation}
        onApplyTemplate={onApplyTemplate}
        onOpenTemplateLibrary={onOpenTemplateLibrary}
      />
    ) : null}

    {composerSlot}
  </div>
);
