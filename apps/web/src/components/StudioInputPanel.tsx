import { ReactNode } from "react";

import type { StudioStartMode } from "../state/studio-start";

interface StudioInputPanelProps {
  mode: StudioStartMode;
  onModeChange: (mode: StudioStartMode) => void;
  conversationCount: number;
  templateCount: number;
  onOpenTemplateLibrary: () => void;
  headerSlot: ReactNode;
  composerSlot: ReactNode;
}

export const StudioInputPanel = ({
  mode,
  onModeChange,
  conversationCount,
  templateCount,
  onOpenTemplateLibrary,
  headerSlot,
  composerSlot
}: StudioInputPanelProps) => (
  <div className="studio-input-panel">
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
      <section
        className="studio-input-mode-panel"
        data-testid="studio-continue-mode-panel"
      >
        <strong>最近输入</strong>
        <p>{`当前有 ${conversationCount} 个会话、${templateCount} 个模板可继续复用。`}</p>
        <button type="button" onClick={onOpenTemplateLibrary}>
          打开模板库
        </button>
      </section>
    ) : null}

    {headerSlot}
    {composerSlot}
  </div>
);
