import { describe, expect, it } from "vitest";

import {
  BackupEnvelopeSchema,
  createBackupEnvelope,
  inspectBackupEnvelope,
  parseBackupEnvelope
} from "../src/backup";

describe("backup protocol", () => {
  it("creates a checksum-bearing envelope from payload", () => {
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
        appVersion: "0.0.1"
      }
    );

    expect(envelope).toEqual({
      schema_version: 2,
      created_at: "2026-03-12T00:30:00.000Z",
      app_version: "0.0.1",
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
        appVersion: "0.0.1"
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
        appVersion: "0.0.1"
      }
    );

    expect(inspectBackupEnvelope(envelope, 2)).toEqual({
      schemaVersion: 2,
      createdAt: "2026-03-12T00:32:00.000Z",
      appVersion: "0.0.1",
      conversationCount: 2,
      migrationHint: "compatible"
    });
    expect(inspectBackupEnvelope(envelope, 3).migrationHint).toBe("older");
  });
});
