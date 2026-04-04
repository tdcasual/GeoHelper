import type {
  Artifact,
  Checkpoint,
  Run,
  RunEvent
} from "@geohelper/agent-protocol";

import { ArtifactViewer } from "./ArtifactViewer";
import { CheckpointInbox } from "./CheckpointInbox";

interface RunConsoleProps {
  run: Run | null | undefined;
  events: RunEvent[];
  checkpoints: Checkpoint[];
  artifacts: Artifact[];
}

export const RunConsole = ({
  run,
  events,
  checkpoints,
  artifacts
}: RunConsoleProps) => {
  if (!run) {
    return null;
  }

  return (
    <section className="run-console" data-testid="run-console">
      <section className="run-console-card">
        <h2>Run Console</h2>
        <p>{run.id}</p>
        <p>
          {run.profileId} · {run.status}
        </p>
        <p>事件数：{events.length}</p>
      </section>

      <CheckpointInbox checkpoints={checkpoints} />
      <ArtifactViewer artifacts={artifacts} />

      <section className="run-console-card">
        <h3>Timeline</h3>
        {events.length > 0 ? (
          <ul>
            {events.map((event) => (
              <li key={event.id}>
                <span>{event.sequence}</span>
                <span>{event.type}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>暂无事件</p>
        )}
      </section>
    </section>
  );
};
