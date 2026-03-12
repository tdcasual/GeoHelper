import { describe, expect, it } from "vitest";

import {
  BackupEnvelopeSchema,
  compareBackupEnvelopes,
  createBackupEnvelope,
  inspectBackupEnvelope,
  parseBackupEnvelope
} from "../src/backup";

describe("backup protocol", () => {
  it("creates a checksum-bearing envelope from payload with sync metadata", () => {
    const envelope = createBackupEnvelope(
      {
        conversations: [{ id: "conv_1", title: "Lesson" }],
        settings: {
          defaultMode: "byok"
        }
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-12T00:30:00.000Z",
        updatedAt: "2026-03-12T00:35:00.000Z",
        appVersion: "0.0.1",
        snapshotId: "snap_1",
        deviceId: "device_a"
      }
    );

    expect(envelope).toEqual({
      schema_version: 2,
      created_at: "2026-03-12T00:30:00.000Z",
      updated_at: "2026-03-12T00:35:00.000Z",
      app_version: "0.0.1",
      snapshot_id: "snap_1",
      device_id: "device_a",
      checksum: expect.any(String),
      conversations: [{ id: "conv_1", title: "Lesson" }],
      settings: {
        defaultMode: "byok"
      }
    });
    expect(envelope.checksum.length).toBeGreaterThan(0);
  });

  it("parses and validates a stored envelope", () => {
    const envelope = createBackupEnvelope(
      {
        conversations: [{ id: "conv_1" }],
        settings: {}
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-12T00:31:00.000Z",
        updatedAt: "2026-03-12T00:31:30.000Z",
        appVersion: "0.0.1",
        snapshotId: "snap_2",
        deviceId: "device_a"
      }
    );

    expect(parseBackupEnvelope(envelope)).toEqual(envelope);
    expect(() =>
      parseBackupEnvelope({
        ...envelope,
        checksum: "broken"
      })
    ).toThrow("CHECKSUM_MISMATCH");
    expect(BackupEnvelopeSchema.safeParse({ invalid: true }).success).toBe(false);
  });

  it("inspects envelope metadata against a local schema version", () => {
    const envelope = createBackupEnvelope(
      {
        conversations: [{ id: "conv_1" }, { id: "conv_2" }],
        settings: {}
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-12T00:32:00.000Z",
        updatedAt: "2026-03-12T00:33:00.000Z",
        appVersion: "0.0.1",
        snapshotId: "snap_3",
        deviceId: "device_b",
        baseSnapshotId: "snap_2"
      }
    );

    expect(inspectBackupEnvelope(envelope, 2)).toEqual({
      schemaVersion: 2,
      createdAt: "2026-03-12T00:32:00.000Z",
      updatedAt: "2026-03-12T00:33:00.000Z",
      appVersion: "0.0.1",
      conversationCount: 2,
      migrationHint: "compatible",
      snapshotId: "snap_3",
      deviceId: "device_b",
      baseSnapshotId: "snap_2"
    });
    expect(inspectBackupEnvelope(envelope, 3).migrationHint).toBe("older");
  });

  it("compares local and remote envelopes for lightweight sync", () => {
    const remote = createBackupEnvelope(
      {
        conversations: [{ id: "conv_1" }],
        settings: {}
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-12T00:32:00.000Z",
        updatedAt: "2026-03-12T00:33:00.000Z",
        appVersion: "0.0.1",
        snapshotId: "snap_remote",
        deviceId: "device_a"
      }
    );
    const local = createBackupEnvelope(
      {
        conversations: [{ id: "conv_1" }, { id: "conv_2" }],
        settings: {}
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-12T00:32:00.000Z",
        updatedAt: "2026-03-12T00:40:00.000Z",
        appVersion: "0.0.1",
        snapshotId: "snap_local",
        deviceId: "device_a",
        baseSnapshotId: "snap_remote"
      }
    );

    expect(compareBackupEnvelopes(local, remote)).toEqual({
      relation: "local_newer",
      sameChecksum: false,
      newer: "local",
      localSnapshotId: "snap_local",
      remoteSnapshotId: "snap_remote",
      localUpdatedAt: "2026-03-12T00:40:00.000Z",
      remoteUpdatedAt: "2026-03-12T00:33:00.000Z"
    });
  });
});
