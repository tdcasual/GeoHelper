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
import { recordPlatformRunSnapshot } from "../state/platform-run-recorder";
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
  defaultPendingAction?: {
    kind: "checkpoint" | "run" | "delegation";
    targetId: string;
  } | null;
  defaultActionNotice?: string | null;
  defaultActionError?: string | null;
}

const sortRunsByCreatedAt = (runs: Run[]): Run[] =>
  [...runs].sort((left, right) => left.createdAt.localeCompare(right.createdAt));

const isTerminalRunStatus = (status: Run["status"]): boolean =>
  status === "completed" || status === "failed" || status === "cancelled";

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Operator action failed";

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
  defaultInspectorOpen = false,
  defaultPendingAction = null,
  defaultActionNotice = null,
  defaultActionError = null
}: RunConsoleProps) => {
  if (!run) {
    return null;
  }

  const [inspectorOpen, setInspectorOpen] = useState(defaultInspectorOpen);
  const [selectedRunId, setSelectedRunId] = useState(run.id);
  const [pendingAction, setPendingAction] = useState(defaultPendingAction);
  const [actionNotice, setActionNotice] = useState<string | null>(
    defaultActionNotice
  );
  const [actionError, setActionError] = useState<string | null>(
    defaultActionError
  );
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

  const refreshLatestRun = async (): Promise<void> => {
    const [snapshot, latestDelegationSessions] = await Promise.all([
      inspectorClient.streamRun(run.id),
      inspectorClient.listDelegationSessions({
        runId: run.id
      })
    ]);

    recordPlatformRunSnapshot({
      snapshot,
      delegationSessions: latestDelegationSessions
    });
  };

  const refreshSelectedTimeline = async (refreshRunId: string): Promise<void> => {
    if (!inspectorOpen) {
      return;
    }

    await inspectorStore.getState().loadTimeline(refreshRunId);
  };

  const runOperatorAction = async (input: {
    kind: "checkpoint" | "run" | "delegation";
    targetId: string;
    pendingNotice: string;
    successNotice: string;
    refreshRunId?: string;
    action: () => Promise<unknown>;
  }): Promise<void> => {
    setPendingAction({
      kind: input.kind,
      targetId: input.targetId
    });
    setActionNotice(input.pendingNotice);
    setActionError(null);

    try {
      await input.action();
      await refreshLatestRun();
      await refreshSelectedTimeline(input.refreshRunId ?? selectedRunId);
      setActionNotice(input.successNotice);
    } catch (error) {
      setActionNotice(null);
      setActionError(getErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  };

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

  const cancellingRun = pendingAction?.kind === "run" && pendingAction.targetId === run.id;
  const approvingCheckpointId =
    pendingAction?.kind === "checkpoint" ? pendingAction.targetId : null;
  const releasingSessionId =
    pendingAction?.kind === "delegation" ? pendingAction.targetId : null;

  return (
    <section className="run-console" data-testid="run-console">
      <section className="run-console-card">
        <h2>Run Console</h2>
        <p>{run.id}</p>
        <p>
          {run.profileId} · {run.status}
        </p>
        <p>事件数：{events.length}</p>
        <div className="run-console-actions">
          {!isTerminalRunStatus(run.status) ? (
            <button
              type="button"
              className="run-console-inline-action run-console-inline-action-danger"
              disabled={cancellingRun}
              onClick={() => {
                void runOperatorAction({
                  kind: "run",
                  targetId: run.id,
                  pendingNotice: "正在取消 run...",
                  successNotice: "Run 已取消并完成刷新。",
                  action: () => inspectorClient.cancelRun(run.id)
                });
              }}
            >
              {cancellingRun ? "Cancelling..." : "Cancel run"}
            </button>
          ) : null}
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
        </div>
        {actionNotice ? (
          <p className="run-console-feedback" role="status">
            {actionNotice}
          </p>
        ) : null}
        {actionError ? (
          <p className="run-console-feedback run-console-feedback-error" role="alert">
            {actionError}
          </p>
        ) : null}
      </section>

      <CheckpointInbox
        checkpoints={checkpoints}
        approvingCheckpointId={approvingCheckpointId}
        onApproveCheckpoint={(checkpoint) => {
          void runOperatorAction({
            kind: "checkpoint",
            targetId: checkpoint.id,
            pendingNotice: "正在批准 checkpoint...",
            successNotice: "Checkpoint 已批准并完成刷新。",
            action: () =>
              inspectorClient.resolveCheckpoint(checkpoint.id, {
                approved: true
              })
          });
        }}
      />
      <DelegationSessionInbox
        sessions={delegationSessions}
        releasingSessionId={releasingSessionId}
        onReleaseSession={(session) => {
          void runOperatorAction({
            kind: "delegation",
            targetId: session.id,
            pendingNotice: "正在释放 delegation claim...",
            successNotice: "Delegation claim 已释放并完成刷新。",
            refreshRunId: session.runId,
            action: () =>
              inspectorClient.forceReleaseDelegationSession(session.id)
          });
        }}
      />
      <ArtifactViewer artifacts={artifacts} />

      {inspectorOpen ? (
        <section className="run-console-card">
          <AdminRunInspector
            runs={inspectorRuns}
            selectedRunId={selectedRunId}
            selectedTimeline={selectedTimeline}
            loadingRuns={false}
            loadingTimeline={loadingTimeline}
            onReleaseDelegationSession={(session) => {
              void runOperatorAction({
                kind: "delegation",
                targetId: session.id,
                pendingNotice: "正在释放 delegation claim...",
                successNotice: "Delegation claim 已释放并完成刷新。",
                refreshRunId: session.runId,
                action: () =>
                  inspectorClient.forceReleaseDelegationSession(session.id)
              });
            }}
            releasingSessionId={releasingSessionId}
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
