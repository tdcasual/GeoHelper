import { describe, expect, it, vi } from "vitest";

import type { AdminRunTimeline } from "../runtime/types";
import { createAdminRunStore } from "./admin-run-store";

const createAdminRunTimeline = (
  override: Partial<AdminRunTimeline> = {}
): AdminRunTimeline => ({
  run: {
    id: "run_1",
    threadId: "thread_1",
    profileId: "platform_geometry_standard",
    status: "waiting_for_checkpoint",
    inputArtifactIds: [],
    outputArtifactIds: ["artifact_response_1"],
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
  },
  memoryEntries: [],
  ...override
});

describe("admin-run-store", () => {
  it("loads admin runs, caches timelines by run id, and tracks selection/loading state", async () => {
    const listAdminRuns = vi.fn().mockResolvedValue([
      {
        id: "run_1",
        threadId: "thread_1",
        profileId: "platform_geometry_standard",
        status: "waiting_for_checkpoint",
        inputArtifactIds: [],
        outputArtifactIds: [],
        budget: {
          maxModelCalls: 6,
          maxToolCalls: 8,
          maxDurationMs: 120000
        },
        createdAt: "2026-04-10T00:00:00.000Z",
        updatedAt: "2026-04-10T00:01:00.000Z"
      }
    ]);
    const getAdminRunTimeline = vi.fn().mockResolvedValue(createAdminRunTimeline());

    const store = createAdminRunStore({
      listAdminRuns,
      getAdminRunTimeline
    });

    expect(store.getState().loadingRuns).toBe(false);
    expect(store.getState().selectedRunId).toBeNull();

    await store.getState().loadRuns({
      status: "waiting_for_checkpoint"
    });

    expect(listAdminRuns).toHaveBeenCalledWith({
      status: "waiting_for_checkpoint"
    });
    expect(store.getState().runs).toEqual([
      expect.objectContaining({
        id: "run_1",
        status: "waiting_for_checkpoint"
      })
    ]);

    store.getState().selectRun("run_1");
    expect(store.getState().selectedRunId).toBe("run_1");

    const timelinePromise = store.getState().loadTimeline("run_1");
    expect(store.getState().loadingTimelineByRunId.run_1).toBe(true);
    await timelinePromise;

    expect(getAdminRunTimeline).toHaveBeenCalledWith("run_1");
    expect(store.getState().timelinesByRunId.run_1).toEqual(
      expect.objectContaining({
        run: expect.objectContaining({
          id: "run_1"
        }),
        summary: expect.objectContaining({
          artifactCount: 1
        })
      })
    );
    expect(store.getState().loadingTimelineByRunId.run_1).toBe(false);
    expect(store.getState().error).toBeNull();
    expect(store.getState().timelineSyncStateByRunId.run_1).toEqual({
      active: false,
      status: "idle",
      error: null,
      retryCount: 0
    });
  });

  it("refreshes a cached timeline without dropping the selected run or re-entering blank loading state", async () => {
    const getAdminRunTimeline = vi
      .fn()
      .mockResolvedValueOnce(
        createAdminRunTimeline({
          summary: {
            eventCount: 1,
            checkpointCount: 0,
            pendingCheckpointCount: 0,
            delegationSessionCount: 1,
            pendingDelegationCount: 1,
            artifactCount: 1,
            memoryWriteCount: 0,
            childRunCount: 0
          }
        })
      )
      .mockResolvedValueOnce(
        createAdminRunTimeline({
          run: {
            id: "run_1",
            threadId: "thread_1",
            profileId: "platform_geometry_standard",
            status: "completed",
            inputArtifactIds: [],
            outputArtifactIds: ["artifact_response_1", "artifact_response_2"],
            budget: {
              maxModelCalls: 6,
              maxToolCalls: 8,
              maxDurationMs: 120000
            },
            createdAt: "2026-04-10T00:00:00.000Z",
            updatedAt: "2026-04-10T00:02:00.000Z"
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
            },
            {
              id: "artifact_response_2",
              runId: "run_1",
              kind: "response",
              contentType: "application/json",
              storage: "inline",
              metadata: {},
              inlineData: {
                text: "Refreshed response"
              },
              createdAt: "2026-04-10T00:01:59.000Z"
            }
          ],
          summary: {
            eventCount: 2,
            checkpointCount: 0,
            pendingCheckpointCount: 0,
            delegationSessionCount: 0,
            pendingDelegationCount: 0,
            artifactCount: 2,
            memoryWriteCount: 0,
            childRunCount: 0
          }
        })
      );
    const store = createAdminRunStore({
      listAdminRuns: vi.fn().mockResolvedValue([]),
      getAdminRunTimeline
    });

    await store.getState().loadTimeline("run_1");
    store.getState().selectRun("run_1");

    const refreshPromise = store.getState().refreshTimeline("run_1");
    expect(store.getState().selectedRunId).toBe("run_1");
    expect(store.getState().loadingTimelineByRunId.run_1).toBe(false);
    await refreshPromise;

    expect(getAdminRunTimeline).toHaveBeenNthCalledWith(2, "run_1");
    expect(store.getState().selectedRunId).toBe("run_1");
    expect(store.getState().timelinesByRunId.run_1).toEqual(
      expect.objectContaining({
        run: expect.objectContaining({
          status: "completed"
        }),
        summary: expect.objectContaining({
          artifactCount: 2,
          eventCount: 2
        })
      })
    );
  });

  it("stores per-run timeline sync metadata without replacing cached content", async () => {
    const store = createAdminRunStore({
      listAdminRuns: vi.fn().mockResolvedValue([]),
      getAdminRunTimeline: vi.fn().mockResolvedValue(createAdminRunTimeline())
    });

    await store.getState().loadTimeline("run_1");
    store.getState().setTimelineSyncState("run_1", {
      active: true,
      status: "retrying",
      error: "temporary failure",
      retryCount: 2
    });

    expect(store.getState().timelinesByRunId.run_1).toEqual(
      expect.objectContaining({
        run: expect.objectContaining({
          id: "run_1"
        })
      })
    );
    expect(store.getState().timelineSyncStateByRunId.run_1).toEqual({
      active: true,
      status: "retrying",
      error: "temporary failure",
      retryCount: 2
    });
  });
});
