import type { Run } from "@geohelper/agent-protocol";
import type { DelegationSessionRecord } from "@geohelper/agent-store";

import type { AdminRunTimeline } from "../../runtime/types";
import { RunTimelinePage } from "./RunTimelinePage";

interface AdminRunInspectorProps {
  runs: Run[];
  selectedRunId: string | null;
  selectedTimeline: AdminRunTimeline | null | undefined;
  loadingRuns: boolean;
  loadingTimeline: boolean;
  onReleaseDelegationSession?: (session: DelegationSessionRecord) => void;
  releasingSessionId?: string | null;
  onSelectRun: (runId: string) => void;
}

export const AdminRunInspector = ({
  runs,
  selectedRunId,
  selectedTimeline,
  loadingRuns,
  loadingTimeline,
  onReleaseDelegationSession,
  releasingSessionId,
  onSelectRun
}: AdminRunInspectorProps) => (
  <section className="admin-run-inspector" data-testid="admin-run-inspector">
    <header>
      <h2>Admin Run Inspector</h2>
    </header>

    <div className="admin-run-inspector-layout">
      <aside>
        <h3>Runs</h3>
        {loadingRuns ? (
          <p>Loading runs...</p>
        ) : (
          <ul>
            {runs.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  data-run-id={run.id}
                  aria-pressed={selectedRunId === run.id}
                  onClick={() => onSelectRun(run.id)}
                >
                  {run.id}
                </button>
                <span>{run.profileId}</span>
                <span>{run.status}</span>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section>
        {loadingTimeline ? (
          <p>Loading timeline...</p>
        ) : selectedTimeline ? (
          <RunTimelinePage
            run={selectedTimeline.run}
            events={selectedTimeline.events}
            childRuns={selectedTimeline.childRuns}
            checkpoints={selectedTimeline.checkpoints}
            delegationSessions={selectedTimeline.delegationSessions}
            artifacts={selectedTimeline.artifacts}
            summary={selectedTimeline.summary}
            memoryEntries={selectedTimeline.memoryEntries}
            onReleaseDelegationSession={onReleaseDelegationSession}
            releasingSessionId={releasingSessionId}
            onSelectRun={onSelectRun}
          />
        ) : (
          <p>Select a run to inspect.</p>
        )}
      </section>
    </div>
  </section>
);
