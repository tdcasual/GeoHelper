import { createBackupEnvelope } from "@geohelper/protocol";
import { describe, expect, it } from "vitest";

import {
  createMemoryBackupStore,
  GatewayBackupEnvelope,
  GatewayBackupStore
} from "../src/services/backup-store";
import { createMemoryKvClient } from "../src/services/kv-client";
import { createRedisBackupStore } from "../src/services/redis-backup-store";

const createEnvelope = (
  id: string,
  overrides: Partial<GatewayBackupEnvelope> = {}
): GatewayBackupEnvelope =>
  createBackupEnvelope(
    {
      conversations: overrides.conversations ?? [
        {
          id: `conv-${id}`,
          title: `Conversation ${id}`
        }
      ],
      settings: overrides.settings ?? {
        defaultMode: "byok"
      }
    },
    {
      schemaVersion: overrides.schema_version ?? 2,
      createdAt: overrides.created_at ?? `2026-03-11T15:40:0${id}Z`,
      updatedAt: overrides.updated_at ?? `2026-03-11T15:44:0${id}Z`,
      appVersion: overrides.app_version ?? "0.0.1",
      snapshotId: overrides.snapshot_id ?? `snap-${id}`,
      deviceId: overrides.device_id ?? `device-${id}`,
      baseSnapshotId: overrides.base_snapshot_id
    }
  );

type ProtectableGatewayBackupStore = GatewayBackupStore & {
  protectSnapshot: (snapshotId: string) => Promise<unknown>;
  unprotectSnapshot: (snapshotId: string) => Promise<unknown>;
  readProtectedHistory: (limit?: number) => Promise<unknown>;
};

describe("gateway backup store", () => {
  it("accepts envelopes created by the shared backup protocol helper", async () => {
    const store = createMemoryBackupStore({
      now: () => "2026-03-12T00:34:00.000Z"
    });

    const envelope = createBackupEnvelope(
      {
        conversations: [{ id: "conv_shared", title: "Shared" }],
        settings: { defaultMode: "byok" }
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-12T00:33:30.000Z",
        updatedAt: "2026-03-12T00:33:45.000Z",
        appVersion: "0.0.1",
        snapshotId: "snap-shared",
        deviceId: "device-shared"
      }
    );

    await expect(store.writeLatest(envelope)).resolves.toEqual(
      expect.objectContaining({
        checksum: envelope.checksum,
        conversationCount: 1,
        snapshotId: "snap-shared",
        deviceId: "device-shared",
        updatedAt: "2026-03-12T00:33:45.000Z"
      })
    );
  });

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
      readSnapshot: (snapshotId: string) => Promise<Awaited<ReturnType<typeof store.readLatest>>>;
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
      readSnapshot: (snapshotId: string) => Promise<Awaited<ReturnType<GatewayBackupStore["readLatest"]>>>;
    };

    await store.writeLatest(createEnvelope("1"));

    await expect(store.readSnapshot("snap-missing")).resolves.toBeNull();
  });

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

  it("stores retained backup metadata without TTL-driven expiry", async () => {
    const kvClient = createMemoryKvClient();
    const prefix = "geohelper:test:backup:no-ttl";
    const store = createRedisBackupStore(kvClient, {
      prefix,
      ttlSeconds: 300,
      maxHistory: 2,
      maxProtected: 1,
      now: () => "2026-03-11T16:30:00.000Z"
    }) as ProtectableGatewayBackupStore;
    const first = createEnvelope("1");

    await store.writeLatest(first);
    await store.protectSnapshot(first.snapshot_id);

    await expect(
      kvClient.getTtlMs(`${prefix}:snapshot:${first.snapshot_id}`)
    ).resolves.toBeNull();
    await expect(kvClient.getTtlMs(`${prefix}:history`)).resolves.toBeNull();
    await expect(kvClient.getTtlMs(`${prefix}:latest`)).resolves.toBeNull();
  });

  it("keeps memory fallback behavior for local or dev mode", async () => {
    const store = createMemoryBackupStore({
      maxHistory: 2,
      now: () => "2026-03-11T16:00:00.000Z"
    });

    await store.writeLatest(createEnvelope("3"));

    await expect(store.readLatest()).resolves.toEqual(
      expect.objectContaining({
        storedAt: "2026-03-11T16:00:00.000Z",
        snapshotId: "snap-3",
        envelope: expect.objectContaining({
          checksum: createEnvelope("3").checksum
        })
      })
    );
    await expect(store.readHistory()).resolves.toEqual([
      expect.objectContaining({
        storedAt: "2026-03-11T16:00:00.000Z",
        checksum: createEnvelope("3").checksum,
        snapshotId: "snap-3"
      })
    ]);
  });

  it("supports guarded writes when the caller expects no remote snapshot yet", async () => {
    const store = createMemoryBackupStore({
      now: () => "2026-03-11T16:10:00.000Z"
    });
    const first = createEnvelope("1");

    await expect(
      store.writeLatestGuarded({
        envelope: first,
        expectedRemoteSnapshotId: null
      })
    ).resolves.toEqual({
      status: "written",
      backup: expect.objectContaining({
        storedAt: "2026-03-11T16:10:00.000Z",
        snapshotId: "snap-1",
        checksum: first.checksum
      })
    });
  });

  it("supports guarded writes when the expected remote snapshot still matches", async () => {
    const store = createMemoryBackupStore({
      now: (() => {
        let tick = 0;
        const timestamps = [
          "2026-03-11T16:10:00.000Z",
          "2026-03-11T16:11:00.000Z"
        ];
        return () => timestamps[Math.min(tick++, timestamps.length - 1)];
      })()
    });
    const first = createEnvelope("1");
    const second = createEnvelope("2", {
      base_snapshot_id: first.snapshot_id
    });

    await store.writeLatest(first);

    await expect(
      store.writeLatestGuarded({
        envelope: second,
        expectedRemoteSnapshotId: first.snapshot_id,
        expectedRemoteChecksum: first.checksum
      })
    ).resolves.toEqual({
      status: "written",
      backup: expect.objectContaining({
        storedAt: "2026-03-11T16:11:00.000Z",
        snapshotId: "snap-2",
        checksum: second.checksum
      })
    });
  });

  it("returns a guarded conflict and keeps latest/history unchanged when remote moved on", async () => {
    const kvClient = createMemoryKvClient();
    let tick = 0;
    const timestamps = [
      "2026-03-11T16:20:00.000Z",
      "2026-03-11T16:21:00.000Z",
      "2026-03-11T16:22:00.000Z"
    ];
    const store = createRedisBackupStore(kvClient, {
      prefix: "geohelper:test:backup:guarded",
      ttlSeconds: 300,
      maxHistory: 5,
      now: () => timestamps[Math.min(tick++, timestamps.length - 1)]
    });
    const first = createEnvelope("1");
    const second = createEnvelope("2", {
      base_snapshot_id: first.snapshot_id
    });

    await store.writeLatest(first);
    await store.writeLatest(second);

    await expect(
      store.writeLatestGuarded({
        envelope: first,
        expectedRemoteSnapshotId: first.snapshot_id,
        expectedRemoteChecksum: first.checksum
      })
    ).resolves.toEqual({
      status: "conflict",
      comparison: expect.objectContaining({
        relation: "remote_newer"
      }),
      expectedRemoteSnapshotId: first.snapshot_id,
      expectedRemoteChecksum: first.checksum,
      actualRemote: expect.objectContaining({
        storedAt: "2026-03-11T16:21:00.000Z",
        snapshotId: second.snapshot_id,
        checksum: second.checksum
      })
    });

    await expect(store.readLatest()).resolves.toEqual(
      expect.objectContaining({
        storedAt: "2026-03-11T16:21:00.000Z",
        snapshotId: second.snapshot_id,
        checksum: second.checksum
      })
    );
    await expect(store.readHistory()).resolves.toEqual([
      expect.objectContaining({
        storedAt: "2026-03-11T16:21:00.000Z",
        snapshotId: second.snapshot_id
      }),
      expect.objectContaining({
        storedAt: "2026-03-11T16:20:00.000Z",
        snapshotId: first.snapshot_id
      })
    ]);
  });
});
