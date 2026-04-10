import type { DelegationSessionRecord } from "@geohelper/agent-store";

import { presentDelegationSession } from "./delegation-session-presenter";

interface DelegationSessionInboxProps {
  sessions: DelegationSessionRecord[];
  onReleaseSession?: (session: DelegationSessionRecord) => void;
  releasingSessionId?: string | null;
}

export const DelegationSessionInbox = ({
  sessions,
  onReleaseSession,
  releasingSessionId = null
}: DelegationSessionInboxProps) => {
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
                {session.claimedBy ? <p>Claimed by: {session.claimedBy}</p> : null}
                {session.claimExpiresAt ? (
                  <p>Claim expires: {session.claimExpiresAt}</p>
                ) : null}
                {onReleaseSession &&
                session.status === "pending" &&
                session.claimedBy ? (
                  <button
                    type="button"
                    className="run-console-inline-action"
                    disabled={releasingSessionId === session.id}
                    onClick={() => onReleaseSession(session)}
                  >
                    {releasingSessionId === session.id
                      ? "Releasing claim..."
                      : "Force release claim"}
                  </button>
                ) : null}
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
