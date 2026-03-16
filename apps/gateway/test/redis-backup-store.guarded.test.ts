import { describe, expect, it } from "vitest";

import { createMemoryBackupStore } from "../src/services/backup-store";
import { createMemoryKvClient } from "../src/services/kv-client";
import { createRedisBackupStore } from "../src/services/redis-backup-store";
import { createEnvelope } from "./redis-backup-store.test-helpers";

describe("redis backup store guarded writes", () => {
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
