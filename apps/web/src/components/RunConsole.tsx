import type {
  Artifact,
  Checkpoint,
  Run,
  RunEvent
} from "@geohelper/agent-protocol";
import type { DelegationSessionRecord } from "@geohelper/agent-store";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";

import { createControlPlaneClient } from "../runtime/control-plane-client";
import type { AdminRunTimeline } from "../runtime/types";
import { createAdminRunStore } from "../state/admin-run-store";
import { AdminRunInspector } from "./admin/AdminRunInspector";
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
  controlPlaneBaseUrl?: string;
  defaultInspectorOpen?: boolean;
}

const sortRunsByCreatedAt = (runs: Run[]): Run[] =>
  [...runs].sort((left, right) => left.createdAt.localeCompare(right.createdAt));

const buildCurrentTimeline = (input: {
  run: Run;
  events: RunEvent[];
  childRuns: Run[];
  checkpoints: Checkpoint[];
  artifacts: Artifact[];
  delegationSessions: DelegationSessionRecord[];
}): AdminRunTimeline => ({
  run: input.run,
  events: input.events,
  childRuns: input.childRuns,
  checkpoints: input.checkpoints,
  delegationSessions: input.delegationSessions,
  artifacts: input.artifacts,
  summary: {
    eventCount: input.events.length,
    checkpointCount: input.checkpoints.length,
    pendingCheckpointCount: input.checkpoints.filter(
      (checkpoint) => checkpoint.status === "pending"
    ).length,
    delegationSessionCount: input.delegationSessions.length,
    pendingDelegationCount: input.delegationSessions.filter(
      (session) => session.status === "pending"
    ).length,
    artifactCount: input.artifacts.length,
    memoryWriteCount: 0,
    childRunCount: input.childRuns.length
  },
  memoryEntries: []
});

export const RunConsole = ({
  run,
  events,
  childRuns,
  checkpoints,
  artifacts,
  delegationSessions,
  controlPlaneBaseUrl,
  defaultInspectorOpen = false
}: RunConsoleProps) => {
  if (!run) {
    return null;
  }

  const [inspectorOpen, setInspectorOpen] = useState(defaultInspectorOpen);
  const [selectedRunId, setSelectedRunId] = useState(run.id);
  const inspectorClient = useMemo(
    () => createControlPlaneClient({ baseUrl: controlPlaneBaseUrl }),
    [controlPlaneBaseUrl]
  );
  const inspectorStore = useMemo(
    () => createAdminRunStore(inspectorClient),
    [inspectorClient]
  );
  const timelinesByRunId = useStore(inspectorStore, (state) => state.timelinesByRunId);
  const loadingTimelineByRunId = useStore(
    inspectorStore,
    (state) => state.loadingTimelineByRunId
  );
  const inspectorError = useStore(inspectorStore, (state) => state.error);
  const currentTimeline = useMemo(
    () =>
      buildCurrentTimeline({
        run,
        events,
        childRuns,
        checkpoints,
        artifacts,
        delegationSessions
      }),
    [artifacts, checkpoints, childRuns, delegationSessions, events, run]
  );
  const inspectorRuns = useMemo(
    () => sortRunsByCreatedAt([run, ...childRuns]),
    [childRuns, run]
  );
  const selectedTimeline =
    selectedRunId === run.id ? currentTimeline : timelinesByRunId[selectedRunId] ?? null;
  const loadingTimeline =
    selectedRunId !== run.id && Boolean(loadingTimelineByRunId[selectedRunId]);

  useEffect(() => {
    setSelectedRunId(run.id);
  }, [run.id]);

  useEffect(() => {
    if (!inspectorOpen || selectedRunId === run.id) {
      return;
    }

    if (timelinesByRunId[selectedRunId] || loadingTimelineByRunId[selectedRunId]) {
      return;
    }

    void inspectorStore.getState().loadTimeline(selectedRunId);
  }, [
    inspectorOpen,
    inspectorStore,
    loadingTimelineByRunId,
    run.id,
    selectedRunId,
    timelinesByRunId
  ]);

  return (
    <section className="run-console" data-testid="run-console">
      <section className="run-console-card">
        <h2>Run Console</h2>
        <p>{run.id}</p>
        <p>
          {run.profileId} · {run.status}
        </p>
        <p>事件数：{events.length}</p>
        <button
          type="button"
          className="run-console-inspector-toggle"
          onClick={() => {
            setInspectorOpen((previous) => {
              const next = !previous;
              if (next) {
                setSelectedRunId(run.id);
              }
              return next;
            });
          }}
        >
          Inspect run
        </button>
      </section>

      <CheckpointInbox checkpoints={checkpoints} />
      <DelegationSessionInbox sessions={delegationSessions} />
      <ArtifactViewer artifacts={artifacts} />

      {inspectorOpen ? (
        <section className="run-console-card">
          <AdminRunInspector
            runs={inspectorRuns}
            selectedRunId={selectedRunId}
            selectedTimeline={selectedTimeline}
            loadingRuns={false}
            loadingTimeline={loadingTimeline}
            onSelectRun={(runId) => {
              setSelectedRunId(runId);
            }}
          />
          {inspectorError ? <p>{inspectorError}</p> : null}
        </section>
      ) : null}

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
