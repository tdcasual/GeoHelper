import type { AcpSessionRecord } from "@geohelper/agent-store";

interface AcpSessionInboxProps {
  sessions: AcpSessionRecord[];
}

export const AcpSessionInbox = ({ sessions }: AcpSessionInboxProps) => {
  const visibleSessions = sessions.filter((session) => session.status !== "cancelled");

  return (
    <section className="run-console-card" data-testid="acp-session-inbox">
      <h3>ACP Sessions</h3>
      {visibleSessions.length > 0 ? (
        <ul>
          {visibleSessions.map((session) => (
            <li key={session.id}>
              <strong>{session.delegationName}</strong>
              <p>{session.agentRef}</p>
              <p>{session.status}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p>暂无 ACP session</p>
      )}
    </section>
  );
};
