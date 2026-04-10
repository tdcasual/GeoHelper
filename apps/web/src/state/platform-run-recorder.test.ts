import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPlatformRunProfile } from "../runtime/platform-run-profiles";
import {
  createRunSnapshotFixture,
  createRuntimeRunResponseFixture
} from "../test-utils/platform-run-fixture";
import { createArtifactStore, artifactStore } from "./artifact-store";
import { createChatStore } from "./chat-store";
import { createCheckpointStore, checkpointStore } from "./checkpoint-store";
import {
  createDelegationSessionStore,
  delegationSessionStore
} from "./delegation-session-store";
import { createPlatformRunRecorder } from "./platform-run-recorder";
import { createRunStore, runStore } from "./run-store";

const createPendingCheckpoint = (runId: string) => ({
  id: `checkpoint_${runId}`,
  runId,
  nodeId: "node_teacher_checkpoint",
  kind: "human_input" as const,
  status: "pending" as const,
  title: "请确认下一步",
  prompt: "是否批准当前几何推导？",
  createdAt: "2026-04-10T00:00:01.000Z"
});

const createPendingDelegationSession = (runId: string) => ({
  id: `delegation_session_${runId}`,
  runId,
  checkpointId: `checkpoint_${runId}`,
  delegationName: "teacher_review",
  agentRef: "openclaw.geometry-reviewer",
  status: "pending" as const,
  claimedBy: "executor_geometry_reviewer",
  claimedAt: "2026-04-10T00:00:02.000Z",
  claimExpiresAt: "2026-04-10T00:05:02.000Z",
  outputArtifactIds: [],
  createdAt: "2026-04-10T00:00:02.000Z",
  updatedAt: "2026-04-10T00:00:02.000Z"
});

describe("platform-run-recorder", () => {
  beforeEach(() => {
    runStore.getState().clear();
    checkpointStore.getState().clear();
    artifactStore.getState().clear();
    delegationSessionStore.getState().clear();
  });

  it("applies a fresh platform run snapshot across the existing stores", () => {
    const localRunStore = createRunStore();
    const localCheckpointStore = createCheckpointStore();
    const localArtifactStore = createArtifactStore();
    const localDelegationSessionStore = createDelegationSessionStore();
    const recordPlatformRunSnapshot = createPlatformRunRecorder({
      runStore: localRunStore,
      checkpointStore: localCheckpointStore,
      artifactStore: localArtifactStore,
      delegationSessionStore: localDelegationSessionStore
    });
    const snapshot = createRunSnapshotFixture({
      run: {
        id: "run_operator_surface",
        status: "waiting_for_checkpoint"
      },
      checkpoints: [createPendingCheckpoint("run_operator_surface")]
    });
    const delegationSessions = [
      createPendingDelegationSession("run_operator_surface")
    ];

    recordPlatformRunSnapshot({
      snapshot,
      delegationSessions
    });

    expect(localRunStore.getState().latestRunId).toBe("run_operator_surface");
    expect(localRunStore.getState().runsById.run_operator_surface?.status).toBe(
      "waiting_for_checkpoint"
    );
    expect(
      localCheckpointStore.getState().checkpointsByRunId.run_operator_surface
    ).toEqual([
      expect.objectContaining({
        id: "checkpoint_run_operator_surface",
        status: "pending"
      })
    ]);
    expect(
      localArtifactStore.getState().artifactsByRunId.run_operator_surface
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "artifact_response_fixture",
          runId: "run_operator_surface"
        })
      ])
    );
    expect(
      localDelegationSessionStore.getState().sessionsByRunId.run_operator_surface
    ).toEqual([
      expect.objectContaining({
        id: "delegation_session_run_operator_surface",
        claimedBy: "executor_geometry_reviewer"
      })
    ]);
  });

  it("records chat run snapshots into the shared platform run stores", async () => {
    const submitPrompt = vi.fn().mockResolvedValue(
      createRuntimeRunResponseFixture({
        run: {
          id: "run_chat_operator_surface",
          status: "waiting_for_checkpoint"
        },
        checkpoints: [createPendingCheckpoint("run_chat_operator_surface")],
        delegationSessions: [
          createPendingDelegationSession("run_chat_operator_surface")
        ]
      })
    );
    const resolveRunOptions = vi.fn().mockResolvedValue({
      runtimeTarget: "direct",
      runtimeCapabilities: {
        supportsOfficialAuth: false,
        supportsVision: true,
        supportsAgentSteps: false,
        supportsServerMetrics: false,
        supportsRateLimitHeaders: false
      },
      platformRunProfile: getPlatformRunProfile(),
      retryAttempts: 0,
      extraHeaders: {}
    });
    const store = createChatStore({
      submitPrompt,
      resolveRunOptions
    });

    await store.getState().send("继续推进");

    expect(runStore.getState().runsById.run_chat_operator_surface?.status).toBe(
      "waiting_for_checkpoint"
    );
    expect(
      checkpointStore.getState().checkpointsById
        .checkpoint_run_chat_operator_surface?.status
    ).toBe("pending");
    expect(
      artifactStore.getState().artifactsByRunId.run_chat_operator_surface
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "response",
          runId: "run_chat_operator_surface"
        })
      ])
    );
    expect(
      delegationSessionStore.getState().sessionsById
        .delegation_session_run_chat_operator_surface?.claimedBy
    ).toBe("executor_geometry_reviewer");
  });
});
