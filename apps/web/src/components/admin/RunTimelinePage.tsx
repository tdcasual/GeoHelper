import type {
  Artifact,
  Checkpoint,
  MemoryEntry,
  Run,
  RunEvent
} from "@geohelper/agent-protocol";
import type { DelegationSessionRecord } from "@geohelper/agent-store";

import type { AdminRunTimelineSummary } from "../../runtime/types";
import type { AdminRunTimelineSyncState } from "../../state/admin-run-store";
import { presentDelegationSession } from "../delegation-session-presenter";

interface RunTimelinePageProps {
  run: Run;
  events: RunEvent[];
  childRuns: Run[];
  checkpoints: Checkpoint[];
  delegationSessions: DelegationSessionRecord[];
  artifacts: Artifact[];
  summary: AdminRunTimelineSummary;
  memoryEntries: MemoryEntry[];
  syncState?: AdminRunTimelineSyncState | null;
  onSelectRun?: (runId: string) => void;
  onReleaseDelegationSession?: (session: DelegationSessionRecord) => void;
  releasingSessionId?: string | null;
}

const renderMemoryValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
};

const buildTimelineSyncLabel = (
  syncState: AdminRunTimelineSyncState | null | undefined
): { className: string; message: string } | null => {
  if (!syncState) {
    return null;
  }

  if (syncState.status === "error") {
    return {
      className: "admin-run-sync-status admin-run-sync-status-error",
      message: `Timeline refresh error: ${syncState.error ?? "Unknown refresh failure"}`
    };
  }

  if (syncState.status === "retrying") {
    return {
      className: "admin-run-sync-status",
      message: `Timeline refresh retrying: ${syncState.error ?? "Retry scheduled"}`
    };
  }

  if (syncState.status === "syncing") {
    return {
      className: "admin-run-sync-status",
      message: "Timeline refreshing..."
    };
  }

  if (syncState.active) {
    return {
      className: "admin-run-sync-status",
      message: "Timeline refresh active"
    };
  }

  return null;
};

export const RunTimelinePage = ({
  run,
  events,
  childRuns,
  checkpoints,
  delegationSessions,
  artifacts,
  summary,
  memoryEntries,
  syncState = null,
  onSelectRun,
  onReleaseDelegationSession,
  releasingSessionId = null
}: RunTimelinePageProps) => {
  const syncLabel = buildTimelineSyncLabel(syncState);
  const summaryItems = [
    ["event count", String(summary.eventCount)],
    ["checkpoint count", String(summary.checkpointCount)],
    ["pending checkpoint count", String(summary.pendingCheckpointCount)],
    ["delegation count", String(summary.delegationSessionCount)],
    ["pending delegation count", String(summary.pendingDelegationCount)],
    ["artifact count", String(summary.artifactCount)],
    ["memory write count", String(summary.memoryWriteCount)],
    ["child run count", String(summary.childRunCount)]
  ] as const;

  return (
    <section className="admin-run-timeline-page" data-testid="admin-run-timeline">
      <header>
        <h2>{run.id}</h2>
        <p>
          {run.profileId} · {run.status}
        </p>
        {syncLabel ? <p className={syncLabel.className}>{syncLabel.message}</p> : null}
      </header>

      <section>
        <h3>Summary</h3>
        <dl>
          {summaryItems.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

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
              <p>{checkpoint.prompt}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Artifacts</h3>
        <ul>
          {artifacts.map((artifact) => (
            <li key={artifact.id}>
              <span>{artifact.id}</span>
              <span>{artifact.kind}</span>
              <span>{artifact.runId}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Subagents</h3>
        <ul>
          {childRuns.map((childRun) => (
            <li key={childRun.id}>
              <button
                type="button"
                data-run-id={childRun.id}
                onClick={() => onSelectRun?.(childRun.id)}
              >
                {childRun.id}
              </button>
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
                {session.claimedBy ? <span>{session.claimedBy}</span> : null}
                {session.claimExpiresAt ? <span>{session.claimExpiresAt}</span> : null}
                {onReleaseDelegationSession &&
                session.status === "pending" &&
                session.claimedBy ? (
                  <button
                    type="button"
                    className="run-console-inline-action"
                    onClick={() => onReleaseDelegationSession(session)}
                    disabled={releasingSessionId === session.id}
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
};
