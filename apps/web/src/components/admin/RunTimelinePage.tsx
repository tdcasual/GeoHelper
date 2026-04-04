import type {
  Checkpoint,
  MemoryEntry,
  Run,
  RunEvent
} from "@geohelper/agent-protocol";

interface RunTimelinePageProps {
  run: Run;
  events: RunEvent[];
  checkpoints: Checkpoint[];
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
  checkpoints,
  memoryEntries
}: RunTimelinePageProps) => (
  <section className="admin-run-timeline-page" data-testid="admin-run-timeline">
    <header>
      <h2>{run.id}</h2>
      <p>
        {run.agentId} · {run.status}
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
