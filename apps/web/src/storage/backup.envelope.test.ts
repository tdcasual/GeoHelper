import { createBackupEnvelope } from "@geohelper/protocol";
import { describe, expect, it } from "vitest";

import { exportBackup, importBackup, inspectBackup } from "./backup";

describe("backup envelopes", () => {
  it("accepts envelopes created by the shared backup protocol helper", async () => {
    const envelope = createBackupEnvelope(
      {
        conversations: [{ id: "shared_conv" }],
        settings: { chatVisible: true }
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-12T00:33:00.000Z",
        appVersion: "0.0.1"
      }
    );
    const blob = new Blob([JSON.stringify(envelope)], {
      type: "application/json"
    });

    const restored = await importBackup(blob);

    expect(restored.checksum).toBe(envelope.checksum);
    expect(restored.conversations[0].id).toBe("shared_conv");
  });

  it("inspects schema direction and sync metadata for migration hint", async () => {
    const blob = await exportBackup({
      conversations: [],
      settings: {}
    });

    const inspected = await inspectBackup(blob);
    expect(inspected.schemaVersion).toBeGreaterThan(0);
    expect(inspected.snapshotId.length).toBeGreaterThan(0);
    expect(inspected.deviceId.length).toBeGreaterThan(0);
    expect(inspected.updatedAt.length).toBeGreaterThan(0);
    expect(inspected.migrationHint).toBe("compatible");
  });
});
