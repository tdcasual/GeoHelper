import { describe, expect, it } from "vitest";

import type { GatewayBackupStore } from "../src/services/backup-store";
import { createMemoryKvClient } from "../src/services/kv-client";
import { createRedisBackupStore } from "../src/services/redis-backup-store";
import { createEnvelope } from "./redis-backup-store.test-helpers";

describe("redis backup store latest and history", () => {
  it("persists the latest validated backup envelope across store instances", async () => {
    const kvClient = createMemoryKvClient();
    const store = createRedisBackupStore(kvClient, {
      prefix: "geohelper:test:backup",
      ttlSeconds: 300,
      maxHistory: 3,
      now: () => "2026-03-11T15:45:00.000Z"
    });

    await store.writeLatest(createEnvelope("1"));

    const reloadedStore = createRedisBackupStore(kvClient, {
      prefix: "geohelper:test:backup",
      ttlSeconds: 300,
      maxHistory: 3,
      now: () => "2026-03-11T15:45:00.000Z"
    });

    await expect(reloadedStore.readLatest()).resolves.toEqual(
      expect.objectContaining({
        storedAt: "2026-03-11T15:45:00.000Z",
        snapshotId: "snap-1",
        deviceId: "device-1",
        updatedAt: "2026-03-11T15:44:01Z",
        envelope: expect.objectContaining({
          checksum: createEnvelope("1").checksum,
          schema_version: 2,
          snapshot_id: "snap-1",
          device_id: "device-1"
        })
      })
    );
    await expect(reloadedStore.readHistory(10)).resolves.toEqual([
      expect.objectContaining({
        storedAt: "2026-03-11T15:45:00.000Z",
        checksum: createEnvelope("1").checksum,
        schemaVersion: 2,
        conversationCount: 1,
        snapshotId: "snap-1",
        deviceId: "device-1",
        updatedAt: "2026-03-11T15:44:01Z"
      })
    ]);
  });

  it("keeps the newest backup active while preserving bounded audit history", async () => {
    const kvClient = createMemoryKvClient();
    let tick = 0;
    const timestamps = [
      "2026-03-11T15:50:00.000Z",
      "2026-03-11T15:51:00.000Z"
    ];
    const store = createRedisBackupStore(kvClient, {
      prefix: "geohelper:test:backup:history",
      ttlSeconds: 300,
      maxHistory: 5,
      now: () => timestamps[Math.min(tick++, timestamps.length - 1)]
    });

    await store.writeLatest(createEnvelope("1"));
    await store.writeLatest(createEnvelope("2", { base_snapshot_id: "snap-1" }));

    const reloadedStore = createRedisBackupStore(kvClient, {
      prefix: "geohelper:test:backup:history",
      ttlSeconds: 300,
      maxHistory: 5,
      now: () => "2026-03-11T15:52:00.000Z"
    });

    await expect(reloadedStore.readLatest()).resolves.toEqual(
      expect.objectContaining({
        storedAt: "2026-03-11T15:51:00.000Z",
        snapshotId: "snap-2",
        envelope: expect.objectContaining({
          checksum: createEnvelope("2", { base_snapshot_id: "snap-1" }).checksum,
          base_snapshot_id: "snap-1"
        })
      })
    );
    await expect(reloadedStore.readHistory(10)).resolves.toEqual([
      expect.objectContaining({
        storedAt: "2026-03-11T15:51:00.000Z",
        checksum: createEnvelope("2", { base_snapshot_id: "snap-1" }).checksum,
        snapshotId: "snap-2"
      }),
      expect.objectContaining({
        storedAt: "2026-03-11T15:50:00.000Z",
        checksum: createEnvelope("1").checksum,
        snapshotId: "snap-1"
      })
    ]);
  });

  it("returns deterministic bounded history slices from newest to oldest", async () => {
    const kvClient = createMemoryKvClient();
    let tick = 0;
    const timestamps = [
      "2026-03-11T15:50:00.000Z",
      "2026-03-11T15:51:00.000Z",
      "2026-03-11T15:52:00.000Z"
    ];
    const store = createRedisBackupStore(kvClient, {
      prefix: "geohelper:test:backup:slices",
      ttlSeconds: 300,
      maxHistory: 2,
      now: () => timestamps[Math.min(tick++, timestamps.length - 1)]
    });

    await store.writeLatest(createEnvelope("1"));
    await store.writeLatest(createEnvelope("2", { base_snapshot_id: "snap-1" }));
    await store.writeLatest(createEnvelope("3", { base_snapshot_id: "snap-2" }));

    const reloadedStore = createRedisBackupStore(kvClient, {
      prefix: "geohelper:test:backup:slices",
      ttlSeconds: 300,
      maxHistory: 2,
      now: () => "2026-03-11T15:53:00.000Z"
    });

    await expect(reloadedStore.readHistory()).resolves.toEqual([
      expect.objectContaining({
        storedAt: "2026-03-11T15:52:00.000Z",
        snapshotId: "snap-3"
      }),
      expect.objectContaining({
        storedAt: "2026-03-11T15:51:00.000Z",
        snapshotId: "snap-2"
      })
    ]);
    await expect(reloadedStore.readHistory(1)).resolves.toEqual([
      expect.objectContaining({
        storedAt: "2026-03-11T15:52:00.000Z",
        snapshotId: "snap-3"
      })
    ]);
  });

  it("reads an exact retained snapshot by snapshot id without changing latest or history order", async () => {
    const kvClient = createMemoryKvClient();
    let tick = 0;
    const timestamps = [
      "2026-03-11T15:50:00.000Z",
      "2026-03-11T15:51:00.000Z",
      "2026-03-11T15:52:00.000Z"
    ];
    const store = createRedisBackupStore(kvClient, {
      prefix: "geohelper:test:backup:read-snapshot",
      ttlSeconds: 300,
      maxHistory: 5,
      now: () => timestamps[Math.min(tick++, timestamps.length - 1)]
    });

    const first = createEnvelope("1");
    const second = createEnvelope("2", { base_snapshot_id: "snap-1" });
    const third = createEnvelope("3", { base_snapshot_id: "snap-2" });

    await store.writeLatest(first);
    await store.writeLatest(second);
    await store.writeLatest(third);

    const reloadedStore = createRedisBackupStore(kvClient, {
      prefix: "geohelper:test:backup:read-snapshot",
      ttlSeconds: 300,
      maxHistory: 5,
      now: () => "2026-03-11T15:53:00.000Z"
    }) as typeof store & {
      readSnapshot: (
        snapshotId: string
      ) => Promise<Awaited<ReturnType<typeof store.readLatest>>>;
    };

    const historyBefore = await reloadedStore.readHistory(10);

    await expect(reloadedStore.readSnapshot("snap-3")).resolves.toEqual(
      expect.objectContaining({
        storedAt: "2026-03-11T15:52:00.000Z",
        snapshotId: "snap-3",
        envelope: expect.objectContaining({
          snapshot_id: "snap-3",
          checksum: third.checksum,
          base_snapshot_id: "snap-2"
        })
      })
    );
    await expect(reloadedStore.readSnapshot("snap-1")).resolves.toEqual(
      expect.objectContaining({
        storedAt: "2026-03-11T15:50:00.000Z",
        snapshotId: "snap-1",
        envelope: expect.objectContaining({
          snapshot_id: "snap-1",
          checksum: first.checksum
        })
      })
    );
    await expect(reloadedStore.readLatest()).resolves.toEqual(
      expect.objectContaining({
        snapshotId: "snap-3",
        envelope: expect.objectContaining({
          snapshot_id: "snap-3"
        })
      })
    );
    await expect(reloadedStore.readHistory(10)).resolves.toEqual(historyBefore);
  });

  it("returns null when an exact retained snapshot cannot be found", async () => {
    const kvClient = createMemoryKvClient();
    const store = createRedisBackupStore(kvClient, {
      prefix: "geohelper:test:backup:missing-snapshot",
      ttlSeconds: 300,
      maxHistory: 2,
      now: () => "2026-03-11T15:50:00.000Z"
    }) as GatewayBackupStore & {
      readSnapshot: (
        snapshotId: string
      ) => Promise<Awaited<ReturnType<GatewayBackupStore["readLatest"]>>>;
    };

    await store.writeLatest(createEnvelope("1"));

    await expect(store.readSnapshot("snap-missing")).resolves.toBeNull();
  });

  it("stores retained backup metadata without TTL-driven expiry", async () => {
    const kvClient = createMemoryKvClient();
    const prefix = "geohelper:test:backup:no-ttl";
    const store = createRedisBackupStore(kvClient, {
      prefix,
      ttlSeconds: 300,
      maxHistory: 2,
      maxProtected: 1,
      now: () => "2026-03-11T16:30:00.000Z"
    });
    const first = createEnvelope("1");

    await store.writeLatest(first);

    await expect(
      kvClient.getTtlMs(`${prefix}:snapshot:${first.snapshot_id}`)
    ).resolves.toBeNull();
    await expect(kvClient.getTtlMs(`${prefix}:history`)).resolves.toBeNull();
    await expect(kvClient.getTtlMs(`${prefix}:latest`)).resolves.toBeNull();
  });
});
