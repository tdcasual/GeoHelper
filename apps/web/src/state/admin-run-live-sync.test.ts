import type { DelegationSessionRecord } from "@geohelper/agent-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminRunTimeline } from "../runtime/types";
import { createAdminRunStore } from "./admin-run-store";
import { createAdminRunLiveSyncController } from "./admin-run-live-sync";

const createTimeline = (
  override: Partial<AdminRunTimeline> = {}
): AdminRunTimeline => ({
  run: {
    id: "run_1",
    threadId: "thread_1",
    profileId: "platform_geometry_standard",
    status: "waiting_for_subagent",
    inputArtifactIds: [],
    outputArtifactIds: [],
    budget: {
      maxModelCalls: 6,
      maxToolCalls: 8,
      maxDurationMs: 120000
    },
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:01:00.000Z"
  },
  events: [],
  childRuns: [],
  checkpoints: [],
  delegationSessions: [],
  artifacts: [],
  summary: {
    eventCount: 0,
    checkpointCount: 0,
    pendingCheckpointCount: 0,
    delegationSessionCount: 0,
    pendingDelegationCount: 0,
    artifactCount: 0,
    memoryWriteCount: 0,
    childRunCount: 0
  },
  memoryEntries: [],
  ...override
});

const createPendingClaimedSession = (
  override: Partial<DelegationSessionRecord> = {}
): DelegationSessionRecord => ({
  id: "delegation_session_1",
  runId: "run_1",
  checkpointId: "checkpoint_1",
  delegationName: "teacher_review",
  agentRef: "openclaw.geometry-reviewer",
  status: "pending",
  claimedBy: "executor_geometry_reviewer",
  claimedAt: "2026-04-10T00:00:10.000Z",
  claimExpiresAt: "2026-04-10T00:05:10.000Z",
  outputArtifactIds: [],
  createdAt: "2026-04-10T00:00:10.000Z",
  updatedAt: "2026-04-10T00:00:10.000Z",
  ...override
});

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("admin-run-live-sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps refreshing a selected run until a terminal timeline no longer has a pending claimed delegation session", async () => {
    const getAdminRunTimeline = vi
      .fn()
      .mockResolvedValueOnce(
        createTimeline({
          run: {
            id: "run_1",
            threadId: "thread_1",
            profileId: "platform_geometry_standard",
            status: "completed",
            inputArtifactIds: [],
            outputArtifactIds: [],
            budget: {
              maxModelCalls: 6,
              maxToolCalls: 8,
              maxDurationMs: 120000
            },
            createdAt: "2026-04-10T00:00:00.000Z",
            updatedAt: "2026-04-10T00:01:00.000Z"
          },
          delegationSessions: [createPendingClaimedSession()],
          summary: {
            eventCount: 0,
            checkpointCount: 0,
            pendingCheckpointCount: 0,
            delegationSessionCount: 1,
            pendingDelegationCount: 1,
            artifactCount: 0,
            memoryWriteCount: 0,
            childRunCount: 0
          }
        })
      )
      .mockResolvedValueOnce(
        createTimeline({
          run: {
            id: "run_1",
            threadId: "thread_1",
            profileId: "platform_geometry_standard",
            status: "completed",
            inputArtifactIds: [],
            outputArtifactIds: [],
            budget: {
              maxModelCalls: 6,
              maxToolCalls: 8,
              maxDurationMs: 120000
            },
            createdAt: "2026-04-10T00:00:00.000Z",
            updatedAt: "2026-04-10T00:02:00.000Z"
          },
          delegationSessions: [
            createPendingClaimedSession({
              status: "completed",
              updatedAt: "2026-04-10T00:02:00.000Z",
              resolvedAt: "2026-04-10T00:02:00.000Z"
            })
          ],
          summary: {
            eventCount: 0,
            checkpointCount: 0,
            pendingCheckpointCount: 0,
            delegationSessionCount: 1,
            pendingDelegationCount: 0,
            artifactCount: 0,
            memoryWriteCount: 0,
            childRunCount: 0
          }
        })
      );
    const store = createAdminRunStore({
      listAdminRuns: vi.fn().mockResolvedValue([]),
      getAdminRunTimeline
    });
    const controller = createAdminRunLiveSyncController({
      runId: "run_1",
      refreshTimeline: (runId) => store.getState().refreshTimeline(runId),
      onStateChange: (state) =>
        store.getState().setTimelineSyncState("run_1", state),
      pollIntervalMs: 1_000,
      retryDelayMs: 2_000
    });

    await controller.start();

    expect(store.getState().timelineSyncStateByRunId.run_1).toMatchObject({
      active: true,
      status: "idle",
      error: null,
      retryCount: 0
    });
    expect(store.getState().timelinesByRunId.run_1).toEqual(
      expect.objectContaining({
        delegationSessions: [
          expect.objectContaining({
            claimedBy: "executor_geometry_reviewer",
            status: "pending"
          })
        ]
      })
    );

    vi.advanceTimersByTime(1_000);
    await flushPromises();

    expect(getAdminRunTimeline).toHaveBeenCalledTimes(2);
    expect(store.getState().timelineSyncStateByRunId.run_1).toMatchObject({
      active: false,
      status: "idle",
      error: null,
      retryCount: 0
    });

    vi.advanceTimersByTime(1_000);
    await flushPromises();
    expect(getAdminRunTimeline).toHaveBeenCalledTimes(2);
  });

  it("keeps the last successful timeline while surfacing retry metadata after refresh failures", async () => {
    const store = createAdminRunStore({
      listAdminRuns: vi.fn().mockResolvedValue([]),
      getAdminRunTimeline: vi
        .fn()
        .mockResolvedValueOnce(
          createTimeline({
            run: {
              id: "run_1",
              threadId: "thread_1",
              profileId: "platform_geometry_standard",
              status: "waiting_for_subagent",
              inputArtifactIds: [],
              outputArtifactIds: [],
              budget: {
                maxModelCalls: 6,
                maxToolCalls: 8,
                maxDurationMs: 120000
              },
              createdAt: "2026-04-10T00:00:00.000Z",
              updatedAt: "2026-04-10T00:01:00.000Z"
            },
            artifacts: [
              {
                id: "artifact_response_1",
                runId: "run_1",
                kind: "response",
                contentType: "application/json",
                storage: "inline",
                metadata: {},
                inlineData: {
                  text: "Primary response"
                },
                createdAt: "2026-04-10T00:00:01.000Z"
              }
            ],
            summary: {
              eventCount: 0,
              checkpointCount: 0,
              pendingCheckpointCount: 0,
              delegationSessionCount: 0,
              pendingDelegationCount: 0,
              artifactCount: 1,
              memoryWriteCount: 0,
              childRunCount: 0
            }
          })
        )
        .mockRejectedValueOnce(new Error("timeline refresh failed"))
    });
    const controller = createAdminRunLiveSyncController({
      runId: "run_1",
      refreshTimeline: (runId) => store.getState().refreshTimeline(runId),
      onStateChange: (state) =>
        store.getState().setTimelineSyncState("run_1", state),
      pollIntervalMs: 1_000,
      retryDelayMs: 2_000,
      maxRetryCount: 2
    });

    await controller.start();

    expect(store.getState().timelinesByRunId.run_1).toEqual(
      expect.objectContaining({
        artifacts: [
          expect.objectContaining({
            id: "artifact_response_1"
          })
        ]
      })
    );

    vi.advanceTimersByTime(1_000);
    await flushPromises();

    expect(store.getState().timelinesByRunId.run_1).toEqual(
      expect.objectContaining({
        artifacts: [
          expect.objectContaining({
            id: "artifact_response_1"
          })
        ]
      })
    );
    expect(store.getState().timelineSyncStateByRunId.run_1).toMatchObject({
      active: true,
      status: "retrying",
      error: "timeline refresh failed",
      retryCount: 1
    });
  });
});
