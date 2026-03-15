import type { MouseEventHandler, RefObject } from "react";

import type { ChatMode } from "../../runtime/types";
import { ModelModeSwitcher } from "../ModelModeSwitcher";

type MobileSurface = "canvas" | "chat";

interface WorkspaceTopBarProps {
  mode: ChatMode;
  runtimeSupportsOfficial: boolean;
  activeRuntimeLabel: string;
  compactViewport: boolean;
  mobileActionsButtonRef: RefObject<HTMLButtonElement | null>;
  mobileActionsMenuRef: RefObject<HTMLDivElement | null>;
  mobileActionsOpen: boolean;
  mobileSurface: MobileSurface;
  isSending: boolean;
  isSceneRollingBack: boolean;
  sceneTransactionCount: number;
  sessionToken: string | null;
  chatVisible: boolean;
  onModeChange: (mode: ChatMode) => void;
  onOpenSettings: () => void;
  onToggleMobileActions: MouseEventHandler<HTMLButtonElement>;
  onRollbackAction: () => void;
  onClearSceneAction: () => void;
  onLogoutAction: () => void;
  onToggleChat: () => void;
  onSelectMobileSurface: (surface: MobileSurface) => void;
}

export const WorkspaceTopBar = ({
  mode,
  runtimeSupportsOfficial,
  activeRuntimeLabel,
  compactViewport,
  mobileActionsButtonRef,
  mobileActionsMenuRef,
  mobileActionsOpen,
  mobileSurface,
  isSending,
  isSceneRollingBack,
  sceneTransactionCount,
  sessionToken,
  chatVisible,
  onModeChange,
  onOpenSettings,
  onToggleMobileActions,
  onRollbackAction,
  onClearSceneAction,
  onLogoutAction,
  onToggleChat,
  onSelectMobileSurface
}: WorkspaceTopBarProps) => (
  <header className="top-bar">
    <div className="top-bar-main">
      <h1>GeoHelper</h1>
      <div className="top-bar-actions">
        <ModelModeSwitcher
          mode={mode}
          officialEnabled={runtimeSupportsOfficial}
          onChange={onModeChange}
        />
        <span className="runtime-tag">{activeRuntimeLabel}</span>
        {compactViewport ? (
          <>
            <button
              type="button"
              className="top-bar-button top-bar-button-secondary"
              onClick={onOpenSettings}
            >
              设置
            </button>
            <button
              ref={mobileActionsButtonRef}
              type="button"
              className="top-bar-button top-bar-button-ghost top-bar-more-button"
              data-testid="mobile-more-button"
              onClick={onToggleMobileActions}
            >
              更多
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="top-bar-button top-bar-button-secondary"
              onClick={onOpenSettings}
            >
              设置
            </button>
            <button
              type="button"
              className="top-bar-button top-bar-button-secondary"
              disabled={isSending || isSceneRollingBack || sceneTransactionCount === 0}
              onClick={onRollbackAction}
            >
              回滚上一步
            </button>
            <button
              type="button"
              className="top-bar-button top-bar-button-danger"
              disabled={isSending || isSceneRollingBack}
              onClick={onClearSceneAction}
            >
              清空画布
            </button>
            {mode === "official" && sessionToken && runtimeSupportsOfficial ? (
              <button
                type="button"
                className="top-bar-button top-bar-button-ghost"
                onClick={onLogoutAction}
              >
                退出官方会话
              </button>
            ) : null}
            <button
              type="button"
              className="top-bar-button top-bar-button-ghost"
              onClick={onToggleChat}
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
            onClick={() => onSelectMobileSurface("canvas")}
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
            onClick={() => onSelectMobileSurface("chat")}
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
              disabled={isSending || isSceneRollingBack || sceneTransactionCount === 0}
              onClick={onRollbackAction}
            >
              回滚上一步
            </button>
            <button
              type="button"
              disabled={isSending || isSceneRollingBack}
              onClick={onClearSceneAction}
            >
              清空画布
            </button>
            {mode === "official" && sessionToken && runtimeSupportsOfficial ? (
              <button type="button" onClick={onLogoutAction}>
                退出官方会话
              </button>
            ) : null}
          </div>
        ) : null}
      </>
    ) : null}
  </header>
);
