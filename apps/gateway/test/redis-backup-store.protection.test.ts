import { describe, expect, it } from "vitest";

import { createMemoryBackupStore } from "../src/services/backup-store";
import { createMemoryKvClient } from "../src/services/kv-client";
import { createRedisBackupStore } from "../src/services/redis-backup-store";
import {
  createEnvelope,
  type ProtectableGatewayBackupStore
} from "./redis-backup-store.test-helpers";

describe("redis backup store protection", () => {
  it("marks retained snapshots as protected and exposes protected history", async () => {
    const kvClient = createMemoryKvClient();
    let tick = 0;
    const timestamps = [
      "2026-03-11T15:50:00.000Z",
      "2026-03-11T15:51:00.000Z",
      "2026-03-11T15:52:00.000Z"
    ];
    const store = createRedisBackupStore(kvClient, {
      prefix: "geohelper:test:backup:protected",
      ttlSeconds: 300,
      maxHistory: 5,
      now: () => timestamps[Math.min(tick++, timestamps.length - 1)]
    }) as ProtectableGatewayBackupStore;

    const first = createEnvelope("1");
    const second = createEnvelope("2", {
      base_snapshot_id: first.snapshot_id
    });

    await store.writeLatest(first);
    await store.writeLatest(second);

    await expect(store.protectSnapshot(first.snapshot_id)).resolves.toEqual({
      status: "protected",
      backup: expect.objectContaining({
        snapshotId: first.snapshot_id,
        isProtected: true,
        protectedAt: "2026-03-11T15:52:00.000Z"
      }),
      protectedCount: 1,
      maxProtected: 20
    });

    await expect(store.readProtectedHistory()).resolves.toEqual([
      expect.objectContaining({
        snapshotId: first.snapshot_id,
        isProtected: true,
        protectedAt: "2026-03-11T15:52:00.000Z"
      })
    ]);
    await expect(store.readSnapshot(first.snapshot_id)).resolves.toEqual(
      expect.objectContaining({
        snapshotId: first.snapshot_id,
        isProtected: true,
        protectedAt: "2026-03-11T15:52:00.000Z",
        envelope: expect.objectContaining({
          snapshot_id: first.snapshot_id
        })
      })
    );
    await expect(store.readHistory()).resolves.toEqual([
      expect.objectContaining({
        snapshotId: second.snapshot_id,
        isProtected: false
      }),
      expect.objectContaining({
        snapshotId: first.snapshot_id,
        isProtected: true,
        protectedAt: "2026-03-11T15:52:00.000Z"
      })
    ]);
  });

  it("rejects protection when protected capacity is full and allows unprotecting later", async () => {
    let tick = 0;
    const timestamps = [
      "2026-03-11T16:00:00.000Z",
      "2026-03-11T16:01:00.000Z",
      "2026-03-11T16:02:00.000Z",
      "2026-03-11T16:03:00.000Z"
    ];
    const store = createMemoryBackupStore({
      maxHistory: 5,
      maxProtected: 1,
      now: () => timestamps[Math.min(tick++, timestamps.length - 1)]
    }) as ProtectableGatewayBackupStore;

    const first = createEnvelope("1");
    const second = createEnvelope("2", {
      base_snapshot_id: first.snapshot_id
    });

    await store.writeLatest(first);
    await store.writeLatest(second);

    await expect(store.protectSnapshot("snap-missing")).resolves.toEqual({
      status: "not_found",
      snapshotId: "snap-missing"
    });

    await expect(store.protectSnapshot(first.snapshot_id)).resolves.toEqual({
      status: "protected",
      backup: expect.objectContaining({
        snapshotId: first.snapshot_id,
        isProtected: true,
        protectedAt: "2026-03-11T16:02:00.000Z"
      }),
      protectedCount: 1,
      maxProtected: 1
    });

    await expect(store.protectSnapshot(second.snapshot_id)).resolves.toEqual({
      status: "limit_reached",
      snapshotId: second.snapshot_id,
      protectedCount: 1,
      maxProtected: 1
    });

    await expect(store.unprotectSnapshot(first.snapshot_id)).resolves.toEqual({
      status: "unprotected",
      backup: expect.objectContaining({
        snapshotId: first.snapshot_id,
        isProtected: false
      }),
      protectedCount: 0,
      maxProtected: 1
    });

    await expect(store.protectSnapshot(second.snapshot_id)).resolves.toEqual({
      status: "protected",
      backup: expect.objectContaining({
        snapshotId: second.snapshot_id,
        isProtected: true,
        protectedAt: "2026-03-11T16:03:00.000Z"
      }),
      protectedCount: 1,
      maxProtected: 1
    });
  });

  it("keeps protected snapshots outside the ordinary history pruning window", async () => {
    const kvClient = createMemoryKvClient();
    let tick = 0;
    const timestamps = [
      "2026-03-11T16:10:00.000Z",
      "2026-03-11T16:11:00.000Z",
      "2026-03-11T16:12:00.000Z",
      "2026-03-11T16:13:00.000Z"
    ];
    const store = createRedisBackupStore(kvClient, {
      prefix: "geohelper:test:backup:separate-retention",
      ttlSeconds: 300,
      maxHistory: 1,
      maxProtected: 2,
      now: () => timestamps[Math.min(tick++, timestamps.length - 1)]
    }) as ProtectableGatewayBackupStore;

    const first = createEnvelope("1");
    const second = createEnvelope("2", {
      base_snapshot_id: first.snapshot_id
    });
    const third = createEnvelope("3", {
      base_snapshot_id: second.snapshot_id
    });

    await store.writeLatest(first);
    await store.protectSnapshot(first.snapshot_id);
    await store.writeLatest(second);
    await store.writeLatest(third);

    await expect(store.readHistory(10)).resolves.toEqual([
      expect.objectContaining({
        snapshotId: third.snapshot_id,
        isProtected: false
      }),
      expect.objectContaining({
        snapshotId: first.snapshot_id,
        isProtected: true,
        protectedAt: "2026-03-11T16:11:00.000Z"
      })
    ]);
    await expect(store.readProtectedHistory()).resolves.toEqual([
      expect.objectContaining({
        snapshotId: first.snapshot_id,
        isProtected: true,
        protectedAt: "2026-03-11T16:11:00.000Z"
      })
    ]);
    await expect(store.readSnapshot(second.snapshot_id)).resolves.toBeNull();
  });

  it("prunes a released protected snapshot once ordinary history is already full", async () => {
    let tick = 0;
    const timestamps = [
      "2026-03-11T16:20:00.000Z",
      "2026-03-11T16:21:00.000Z",
      "2026-03-11T16:22:00.000Z"
    ];
    const store = createMemoryBackupStore({
      maxHistory: 1,
      maxProtected: 1,
      now: () => timestamps[Math.min(tick++, timestamps.length - 1)]
    }) as ProtectableGatewayBackupStore;

    const first = createEnvelope("1");
    const second = createEnvelope("2", {
      base_snapshot_id: first.snapshot_id
    });

    await store.writeLatest(first);
    await store.protectSnapshot(first.snapshot_id);
    await store.writeLatest(second);

    await expect(store.unprotectSnapshot(first.snapshot_id)).resolves.toEqual({
      status: "unprotected",
      backup: expect.objectContaining({
        snapshotId: first.snapshot_id,
        isProtected: false
      }),
      protectedCount: 0,
      maxProtected: 1
    });
    await expect(store.readHistory(10)).resolves.toEqual([
      expect.objectContaining({
        snapshotId: second.snapshot_id,
        isProtected: false
      })
    ]);
    await expect(store.readSnapshot(first.snapshot_id)).resolves.toBeNull();
  });
});
