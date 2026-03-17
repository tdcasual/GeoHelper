import type { RefObject } from "react";

export interface CanvasFocusNotice {
  message: string;
  tone?: "info" | "warning";
}

interface CanvasPanelFrameProps {
  hostRef: RefObject<HTMLDivElement | null>;
  visible: boolean;
  status: "loading" | "ready" | "error";
  focusNotice?: CanvasFocusNotice | null;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
}

export const CanvasPanelFrame = ({
  hostRef,
  visible,
  status,
  focusNotice,
  isFullscreen,
  onFullscreenToggle
}: CanvasPanelFrameProps) => (
  <section className="canvas-panel" data-panel="canvas" hidden={!visible}>
    <div ref={hostRef} className="geogebra-host" data-testid="geogebra-host">
      <div id="geogebra-container" className="geogebra-container" />
      {focusNotice ? (
        <div
          className={`canvas-focus-notice${
            focusNotice.tone === "warning" ? " canvas-focus-notice-warning" : ""
          }`}
          data-testid="canvas-focus-notice"
        >
          {focusNotice.message}
        </div>
      ) : null}
      <button
        type="button"
        className="canvas-fullscreen-button"
        data-testid="canvas-fullscreen-button"
        aria-label={isFullscreen ? "退出全屏" : "全屏显示"}
        onClick={onFullscreenToggle}
      >
        {isFullscreen ? "↙" : "↗"}
      </button>
      {status === "loading" ? (
        <div className="canvas-overlay">GeoGebra 正在加载...</div>
      ) : null}
      {status === "error" ? (
        <div className="canvas-overlay canvas-overlay-error">
          GeoGebra 加载失败，请刷新页面重试
        </div>
      ) : null}
    </div>
  </section>
);
