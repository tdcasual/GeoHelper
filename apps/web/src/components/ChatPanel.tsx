import { PropsWithChildren } from "react";

interface ChatPanelProps extends PropsWithChildren {
  visible: boolean;
}

export const ChatPanel = ({ visible, children }: ChatPanelProps) => (
  <aside
    className={`chat-panel${visible ? "" : " chat-panel-hidden"}`}
    data-panel="chat"
    hidden={!visible}
  >
    {children}
  </aside>
);
