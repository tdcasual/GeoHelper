import type {
  Checkpoint,
  MemoryEntry,
  Run,
  RunEvent
} from "@geohelper/agent-protocol";
import type { DelegationSessionRecord } from "@geohelper/agent-store";

import { presentDelegationSession } from "../delegation-session-presenter";

interface RunTimelinePageProps {
  run: Run;
  events: RunEvent[];
  childRuns: Run[];
  checkpoints: Checkpoint[];
  delegationSessions: DelegationSessionRecord[];
  memoryEntries: MemoryEntry[];
}

const renderMemoryValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
};

export const RunTimelinePage = ({
  run,
  events,
  childRuns,
  checkpoints,
  delegationSessions,
  memoryEntries
}: RunTimelinePageProps) => (
  <section className="admin-run-timeline-page" data-testid="admin-run-timeline">
    <header>
      <h2>{run.id}</h2>
      <p>
        {run.profileId} · {run.status}
      </p>
    </header>

    <section>
      <h3>Timeline</h3>
      <ul>
        {events.map((event) => (
          <li key={event.id}>
            <span>{event.sequence}</span>
            <span>{event.type}</span>
          </li>
        ))}
      </ul>
    </section>

    <section>
      <h3>Pending Checkpoints</h3>
      <ul>
        {checkpoints.map((checkpoint) => (
          <li key={checkpoint.id}>
            <span>{checkpoint.title}</span>
            <span>{checkpoint.status}</span>
          </li>
        ))}
      </ul>
    </section>

    <section>
      <h3>Subagents</h3>
      <ul>
        {childRuns.map((childRun) => (
          <li key={childRun.id}>
            <span>{childRun.id}</span>
            <span>{childRun.profileId}</span>
            <span>{childRun.status}</span>
          </li>
        ))}
      </ul>
    </section>

    <section>
      <h3>Delegation Sessions</h3>
      <ul>
        {delegationSessions.map((session) => {
          const presentation = presentDelegationSession(session);

          return (
            <li key={session.id}>
              <span>{session.delegationName}</span>
              <span>{presentation.heading}</span>
              <span>{presentation.target}</span>
              <span>{session.status}</span>
            </li>
          );
        })}
      </ul>
    </section>

    <section>
      <h3>Memory Writes</h3>
      <ul>
        {memoryEntries.map((entry) => (
          <li key={entry.id}>
            <span>{entry.key}</span>
            <span>{renderMemoryValue(entry.value)}</span>
          </li>
        ))}
      </ul>
    </section>
  </section>
);
