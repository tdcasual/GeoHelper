import { FormEvent, useEffect, useMemo, useState } from "react";

import { CanvasPanel } from "./CanvasPanel";
import { ChatPanel } from "./ChatPanel";
import { ModelModeSwitcher } from "./ModelModeSwitcher";
import { SettingsDrawer } from "./SettingsDrawer";
import { TokenGateDialog } from "./TokenGateDialog";
import {
  loginWithPresetToken,
  revokeOfficialSessionToken
} from "../services/api-client";
import { runtimeCapabilitiesByTarget } from "../runtime/types";
import { useChatStore } from "../state/chat-store";
import { useSceneStore } from "../state/scene-store";
import { useSettingsStore } from "../state/settings-store";
import { useTemplateStore } from "../state/template-store";
import { useUIStore } from "../state/ui-store";

export const WorkspaceShell = () => {
  const chatVisible = useUIStore((state) => state.chatVisible);
  const toggleChat = useUIStore((state) => state.toggleChat);
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
  const templates = useTemplateStore((state) => state.templates);
  const [draft, setDraft] = useState("");
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
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

  const handleOfficialLogout = async () => {
    if (!sessionToken) {
      return;
    }

    try {
      await revokeOfficialSessionToken(sessionToken, {
        runtimeTarget,
        runtimeBaseUrl
      });
    } catch {
      // Even when revoke fails remotely, local session must be cleared.
    }

    setSessionToken(null);
  };

  const activeConversation =
    conversations.find((item) => item.id === activeConversationId) ??
    conversations[0];

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || isSending) {
      return;
    }

    const message = draft.trim();
    setDraft("");
    await send(message);
  };

  return (
    <main className={`workspace-shell${chatVisible ? "" : " chat-collapsed"}`}>
      <header className="top-bar">
        <h1>GeoHelper</h1>
        <div className="top-bar-actions">
          <ModelModeSwitcher
            mode={mode}
            officialEnabled={runtimeSupportsOfficial}
            onChange={handleModeChange}
          />
          <span className="runtime-tag">{`Runtime: ${activeRuntimeProfile?.name ?? runtimeTarget}`}</span>
          <button type="button" onClick={() => setSettingsOpen(true)}>
            设置
          </button>
          <button
            type="button"
            disabled={
              isSending || isSceneRollingBack || sceneTransactionCount === 0
            }
            onClick={() => {
              void rollbackLastScene();
            }}
          >
            回滚上一步
          </button>
          <button
            type="button"
            disabled={isSending || isSceneRollingBack}
            onClick={() => {
              void clearScene();
            }}
          >
            清空画布
          </button>
          {mode === "official" && sessionToken && runtimeSupportsOfficial ? (
            <button type="button" onClick={handleOfficialLogout}>
              退出官方会话
            </button>
          ) : null}
          <button type="button" onClick={toggleChat}>
            {chatVisible ? "Hide Chat" : "Show Chat"}
          </button>
        </div>
      </header>
      <div className="workspace-content">
        <CanvasPanel />
        <ChatPanel visible={chatVisible}>
          <div className="chat-shell">
            <aside className="conversation-sidebar" data-testid="conversation-sidebar">
              <div className="conversation-sidebar-header">
                <button
                  type="button"
                  className="new-conversation-button"
                  onClick={() => {
                    createConversation();
                    setDraft("");
                  }}
                >
                  新建会话
                </button>
              </div>
              <div className="conversation-list">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    data-testid="conversation-item"
                    className={`conversation-item${
                      conversation.id === activeConversationId
                        ? " conversation-item-active"
                        : ""
                    }`}
                    onClick={() => selectConversation(conversation.id)}
                  >
                    <span className="conversation-item-title">
                      {conversation.title}
                    </span>
                    <span className="conversation-item-meta">
                      {new Date(conversation.updatedAt).toLocaleTimeString(
                        "zh-CN",
                        {
                          hour: "2-digit",
                          minute: "2-digit"
                        }
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </aside>
            <div className="chat-body">
              <div className="chat-thread-header">
                <h3>{activeConversation?.title ?? "新会话"}</h3>
                <span className="scene-transaction-count">
                  事务数: {sceneTransactionCount}
                </span>
              </div>
              <div className="chat-messages">
                {messages.length === 0 ? (
                  <div className="chat-empty">开始输入你的几何需求</div>
                ) : (
                  messages.map((message) => (
                    <article
                      key={message.id}
                      className={`chat-message chat-message-${message.role}`}
                    >
                      {message.content}
                      {showAgentSteps &&
                      message.role === "assistant" &&
                      message.agentSteps &&
                      message.agentSteps.length > 0 ? (
                        <section className="agent-steps" data-testid="agent-steps">
                          <h4>Agent Steps</h4>
                          <ul>
                            {message.agentSteps.map((step, index) => (
                              <li
                                key={`${message.id}_${step.name}_${index}`}
                                className={`agent-step agent-step-${step.status}`}
                              >
                                <span className="agent-step-name">{step.name}</span>
                                <span className="agent-step-status">
                                  {step.status}
                                </span>
                                <span className="agent-step-time">
                                  {step.duration_ms}ms
                                </span>
                              </li>
                            ))}
                          </ul>
                        </section>
                      ) : null}
                    </article>
                  ))
                )}
                {mode === "official" && !sessionToken ? (
                  <div className="session-warning" data-testid="session-warning">
                    官方模式未登录或会话已过期，请输入 Token
                  </div>
                ) : null}
              </div>
              <form className="chat-input-row" onSubmit={handleSend}>
                <label className="template-select-row">
                  <span>模板</span>
                  <select
                    value={selectedTemplateId}
                    onChange={(event) => {
                      const nextId = event.target.value;
                      setSelectedTemplateId(nextId);
                      if (!nextId) {
                        return;
                      }
                      const selected = templates.find((item) => item.id === nextId);
                      if (selected) {
                        setDraft(selected.prompt);
                      }
                    }}
                  >
                    <option value="">选择模板（可选）</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.title}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="例如：过点A和B作垂直平分线"
                />
                <button type="submit" disabled={isSending}>
                  {isSending ? "生成中..." : "发送"}
                </button>
              </form>
            </div>
          </div>
        </ChatPanel>
      </div>
      <TokenGateDialog
        open={tokenDialogOpen && runtimeSupportsOfficial}
        onClose={() => setTokenDialogOpen(false)}
        onSubmit={async (token) => {
          const result = await loginWithPresetToken(token, deviceId, {
            runtimeTarget,
            runtimeBaseUrl
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
