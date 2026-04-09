import type { DelegationSessionRecord } from "@geohelper/agent-store";

import { presentDelegationSession } from "./delegation-session-presenter";

interface DelegationSessionInboxProps {
  sessions: DelegationSessionRecord[];
}

export const DelegationSessionInbox = ({ sessions }: DelegationSessionInboxProps) => {
  const visibleSessions = sessions.filter((session) => session.status !== "cancelled");

  return (
    <section className="run-console-card" data-testid="delegation-session-inbox">
      <h3>Delegation Sessions</h3>
      {visibleSessions.length > 0 ? (
        <ul>
          {visibleSessions.map((session) => {
            const presentation = presentDelegationSession(session);

            return (
              <li key={session.id}>
              <strong>{session.delegationName}</strong>
              <p>{presentation.heading}</p>
              <p>{presentation.target}</p>
              <p>{session.status}</p>
            </li>
            );
          })}
        </ul>
      ) : (
        <p>暂无 delegation session</p>
      )}
    </section>
  );
};
