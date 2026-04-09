import type {
  Artifact,
  Checkpoint,
  Run,
  RunEvent
} from "@geohelper/agent-protocol";
import type { DelegationSessionRecord } from "@geohelper/agent-store";

import { ArtifactViewer } from "./ArtifactViewer";
import { CheckpointInbox } from "./CheckpointInbox";
import { DelegationSessionInbox } from "./DelegationSessionInbox";

interface RunConsoleProps {
  run: Run | null | undefined;
  events: RunEvent[];
  childRuns: Run[];
  checkpoints: Checkpoint[];
  artifacts: Artifact[];
  delegationSessions: DelegationSessionRecord[];
}

export const RunConsole = ({
  run,
  events,
  childRuns,
  checkpoints,
  artifacts,
  delegationSessions
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
      <DelegationSessionInbox sessions={delegationSessions} />
      <ArtifactViewer artifacts={artifacts} />

      <section className="run-console-card">
        <h3>Subagents</h3>
        {childRuns.length > 0 ? (
          <ul>
            {childRuns.map((childRun) => (
              <li key={childRun.id}>
                <span>{childRun.id}</span>
                <span>{childRun.profileId}</span>
                <span>{childRun.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>暂无 subagent</p>
        )}
      </section>

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
