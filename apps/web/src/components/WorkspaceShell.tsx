import { FormEvent, useMemo, useState } from "react";

import { CanvasPanel } from "./CanvasPanel";
import { ChatPanel } from "./ChatPanel";
import { ModelModeSwitcher } from "./ModelModeSwitcher";
import { TokenGateDialog } from "./TokenGateDialog";
import { loginWithPresetToken } from "../services/api-client";
import { useChatStore } from "../state/chat-store";
import { useUIStore } from "../state/ui-store";

export const WorkspaceShell = () => {
  const chatVisible = useUIStore((state) => state.chatVisible);
  const toggleChat = useUIStore((state) => state.toggleChat);
  const mode = useChatStore((state) => state.mode);
  const messages = useChatStore((state) => state.messages);
  const isSending = useChatStore((state) => state.isSending);
  const sessionToken = useChatStore((state) => state.sessionToken);
  const setMode = useChatStore((state) => state.setMode);
  const setSessionToken = useChatStore((state) => state.setSessionToken);
  const send = useChatStore((state) => state.send);
  const [draft, setDraft] = useState("");
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);

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
    setMode(nextMode);
    if (nextMode === "official" && !sessionToken) {
      setTokenDialogOpen(true);
    }
  };

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
          <ModelModeSwitcher mode={mode} onChange={handleModeChange} />
          <button type="button" onClick={toggleChat}>
            {chatVisible ? "Hide Chat" : "Show Chat"}
          </button>
        </div>
      </header>
      <div className="workspace-content">
        <CanvasPanel />
        <ChatPanel visible={chatVisible}>
          <div className="chat-body">
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
                  </article>
                ))
              )}
            </div>
            <form className="chat-input-row" onSubmit={handleSend}>
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
        </ChatPanel>
      </div>
      <TokenGateDialog
        open={tokenDialogOpen}
        onClose={() => setTokenDialogOpen(false)}
        onSubmit={async (token) => {
          const result = await loginWithPresetToken(token, deviceId);
          setSessionToken(result.session_token);
          setTokenDialogOpen(false);
        }}
      />
    </main>
  );
};
