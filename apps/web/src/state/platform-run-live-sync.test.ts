import type { DelegationSessionRecord } from "@geohelper/agent-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRunSnapshotFixture } from "../test-utils/platform-run-fixture";
import { createPlatformRunLiveSyncController } from "./platform-run-live-sync";

const createDelegationSession = (
  runId: string,
  override: Partial<DelegationSessionRecord> = {}
): DelegationSessionRecord => ({
  id: `delegation_session_${runId}`,
  runId,
  checkpointId: `checkpoint_${runId}`,
  delegationName: "teacher_review",
  agentRef: "openclaw.geometry-reviewer",
  status: "pending",
  outputArtifactIds: [],
  createdAt: "2026-04-10T00:00:02.000Z",
  updatedAt: "2026-04-10T00:00:02.000Z",
  ...override
});

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("platform-run-live-sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls the latest run with afterSequence, records snapshots, and stops after a terminal run", async () => {
    const firstSnapshot = createRunSnapshotFixture({
      run: {
        id: "run_live_sync",
        status: "waiting_for_checkpoint"
      },
      events: [
        {
          id: "event_1",
          runId: "run_live_sync",
          sequence: 1,
          type: "run.created",
          payload: {},
          createdAt: "2026-04-10T00:00:00.000Z"
        },
        {
          id: "event_2",
          runId: "run_live_sync",
          sequence: 2,
          type: "checkpoint.waiting",
          payload: {
            checkpointId: "checkpoint_run_live_sync"
          },
          createdAt: "2026-04-10T00:00:02.000Z"
        }
      ]
    });
    const secondSnapshot = createRunSnapshotFixture({
      run: {
        id: "run_live_sync",
        status: "completed"
      },
      events: [
        ...firstSnapshot.events,
        {
          id: "event_3",
          runId: "run_live_sync",
          sequence: 3,
          type: "run.completed",
          payload: {},
          createdAt: "2026-04-10T00:00:05.000Z"
        }
      ]
    });
    const streamRun = vi
      .fn()
      .mockResolvedValueOnce(firstSnapshot)
      .mockResolvedValueOnce(secondSnapshot);
    const listDelegationSessions = vi
      .fn()
      .mockResolvedValueOnce([createDelegationSession("run_live_sync")])
      .mockResolvedValueOnce([
        createDelegationSession("run_live_sync", {
          status: "completed",
          updatedAt: "2026-04-10T00:00:05.000Z",
          resolvedAt: "2026-04-10T00:00:05.000Z"
        })
      ]);
    const recordPlatformRunSnapshot = vi.fn();
    const controller = createPlatformRunLiveSyncController({
      runId: "run_live_sync",
      client: {
        streamRun,
        listDelegationSessions
      },
      recordPlatformRunSnapshot,
      pollIntervalMs: 1_000,
      retryDelayMs: 2_000
    });

    expect(controller.getState()).toMatchObject({
      active: false,
      status: "idle",
      error: null
    });

    const startPromise = controller.start();
    expect(controller.getState()).toMatchObject({
      active: true,
      status: "syncing"
    });
    await startPromise;

    expect(streamRun).toHaveBeenNthCalledWith(1, "run_live_sync", {});
    expect(listDelegationSessions).toHaveBeenNthCalledWith(1, {
      runId: "run_live_sync"
    });
    expect(recordPlatformRunSnapshot).toHaveBeenNthCalledWith(1, {
      snapshot: firstSnapshot,
      delegationSessions: [expect.objectContaining({ id: "delegation_session_run_live_sync" })]
    });
    expect(controller.getState()).toMatchObject({
      active: true,
      status: "idle",
      error: null,
      retryCount: 0
    });

    vi.advanceTimersByTime(1_000);
    await flushPromises();

    expect(streamRun).toHaveBeenNthCalledWith(2, "run_live_sync", {
      afterSequence: 2
    });
    expect(recordPlatformRunSnapshot).toHaveBeenNthCalledWith(2, {
      snapshot: secondSnapshot,
      delegationSessions: [
        expect.objectContaining({
          status: "completed"
        })
      ]
    });
    expect(controller.getState()).toMatchObject({
      active: false,
      status: "idle",
      error: null,
      retryCount: 0
    });

    vi.advanceTimersByTime(1_000);
    await flushPromises();
    expect(streamRun).toHaveBeenCalledTimes(2);
  });

  it("enters retrying state after a failed refresh and retries with the existing cursor", async () => {
    const recoverySnapshot = createRunSnapshotFixture({
      run: {
        id: "run_retry_live_sync",
        status: "completed"
      },
      events: [
        {
          id: "event_1",
          runId: "run_retry_live_sync",
          sequence: 1,
          type: "run.created",
          payload: {},
          createdAt: "2026-04-10T00:00:00.000Z"
        }
      ]
    });
    const streamRun = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary control-plane outage"))
      .mockResolvedValueOnce(recoverySnapshot);
    const listDelegationSessions = vi.fn().mockResolvedValue([]);
    const recordPlatformRunSnapshot = vi.fn();
    const controller = createPlatformRunLiveSyncController({
      runId: "run_retry_live_sync",
      client: {
        streamRun,
        listDelegationSessions
      },
      recordPlatformRunSnapshot,
      pollIntervalMs: 1_000,
      retryDelayMs: 2_000,
      maxRetryCount: 2
    });

    await controller.start();

    expect(controller.getState()).toMatchObject({
      active: true,
      status: "retrying",
      error: "temporary control-plane outage",
      retryCount: 1
    });
    expect(recordPlatformRunSnapshot).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2_000);
    await flushPromises();

    expect(streamRun).toHaveBeenNthCalledWith(2, "run_retry_live_sync", {});
    expect(listDelegationSessions).toHaveBeenNthCalledWith(1, {
      runId: "run_retry_live_sync"
    });
    expect(recordPlatformRunSnapshot).toHaveBeenCalledWith({
      snapshot: recoverySnapshot,
      delegationSessions: []
    });
    expect(controller.getState()).toMatchObject({
      active: false,
      status: "idle",
      error: null,
      retryCount: 0
    });
  });

  it("surfaces an error state after exhausting the retry budget", async () => {
    const streamRun = vi.fn().mockRejectedValue(new Error("run stream unavailable"));
    const listDelegationSessions = vi.fn().mockResolvedValue([]);
    const recordPlatformRunSnapshot = vi.fn();
    const controller = createPlatformRunLiveSyncController({
      runId: "run_retry_budget",
      client: {
        streamRun,
        listDelegationSessions
      },
      recordPlatformRunSnapshot,
      pollIntervalMs: 1_000,
      retryDelayMs: 2_000,
      maxRetryCount: 0
    });

    await controller.start();

    expect(recordPlatformRunSnapshot).not.toHaveBeenCalled();
    expect(listDelegationSessions).toHaveBeenCalledWith({
      runId: "run_retry_budget"
    });
    expect(controller.getState()).toMatchObject({
      active: false,
      status: "error",
      error: "run stream unavailable",
      retryCount: 1
    });

    vi.advanceTimersByTime(2_000);
    await flushPromises();
    expect(streamRun).toHaveBeenCalledTimes(1);
  });
});
