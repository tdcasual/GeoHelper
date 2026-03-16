import { readFile } from "node:fs/promises";

import { createBackupEnvelope } from "@geohelper/protocol";
import { describe, expect, it } from "vitest";

import { createMemoryBackupStore } from "../src/services/backup-store";
import { createEnvelope } from "./redis-backup-store.test-helpers";

describe("gateway backup store facade", () => {
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

  it("keeps the redis backup store facade suite below the test maintainability budget", async () => {
    const code = await readFile(new URL("./redis-backup-store.test.ts", import.meta.url), "utf8");
    expect(code.split(/\r?\n/).length).toBeLessThan(260);
  });
});
