import { createBackupEnvelope } from "@geohelper/protocol";
import { describe, expect, it } from "vitest";

import {
  createMemoryBackupStore,
  GatewayBackupEnvelope
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
      appVersion: overrides.app_version ?? "0.0.1"
    }
  );

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
        appVersion: "0.0.1"
      }
    );

    await expect(store.writeLatest(envelope)).resolves.toEqual(
      expect.objectContaining({
        checksum: envelope.checksum,
        conversationCount: 1
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
        envelope: expect.objectContaining({
          checksum: createEnvelope("1").checksum,
          schema_version: 2
        })
      })
    );
    await expect(reloadedStore.readHistory(10)).resolves.toEqual([
      expect.objectContaining({
        storedAt: "2026-03-11T15:45:00.000Z",
        checksum: createEnvelope("1").checksum,
        schemaVersion: 2,
        conversationCount: 1
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
    await store.writeLatest(createEnvelope("2"));

    const reloadedStore = createRedisBackupStore(kvClient, {
      prefix: "geohelper:test:backup:history",
      ttlSeconds: 300,
      maxHistory: 5,
      now: () => "2026-03-11T15:52:00.000Z"
    });

    await expect(reloadedStore.readLatest()).resolves.toEqual(
      expect.objectContaining({
        storedAt: "2026-03-11T15:51:00.000Z",
        envelope: expect.objectContaining({
          checksum: createEnvelope("2").checksum
        })
      })
    );
    await expect(reloadedStore.readHistory(10)).resolves.toEqual([
      expect.objectContaining({
        storedAt: "2026-03-11T15:51:00.000Z",
        checksum: createEnvelope("2").checksum
      }),
      expect.objectContaining({
        storedAt: "2026-03-11T15:50:00.000Z",
        checksum: createEnvelope("1").checksum
      })
    ]);
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
        envelope: expect.objectContaining({
          checksum: createEnvelope("3").checksum
        })
      })
    );
    await expect(store.readHistory()).resolves.toEqual([
      expect.objectContaining({
        storedAt: "2026-03-11T16:00:00.000Z",
        checksum: createEnvelope("3").checksum
      })
    ]);
  });
});
