import { CanvasPanel } from "./CanvasPanel";
import { ChatPanel } from "./ChatPanel";
import { useUIStore } from "../state/ui-store";

export const WorkspaceShell = () => {
  const chatVisible = useUIStore((state) => state.chatVisible);
  const toggleChat = useUIStore((state) => state.toggleChat);

  return (
    <main className={`workspace-shell${chatVisible ? "" : " chat-collapsed"}`}>
      <header className="top-bar">
        <h1>GeoHelper</h1>
        <button type="button" onClick={toggleChat}>
          {chatVisible ? "Hide Chat" : "Show Chat"}
        </button>
      </header>
      <div className="workspace-content">
        <CanvasPanel />
        <ChatPanel visible={chatVisible}>
          <div className="chat-placeholder">Chat Panel</div>
        </ChatPanel>
      </div>
    </main>
  );
};
