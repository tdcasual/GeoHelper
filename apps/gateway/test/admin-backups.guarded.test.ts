import { describe, expect, it } from "vitest";

import {
  buildIdentity,
  createAdminBackupApp,
  createEnvelope,
  toLocalSummary
} from "./admin-backups.test-helpers";

describe("admin backup guarded routes", () => {
  it("compares a local summary against the latest remote snapshot using metadata only", async () => {
    let tick = 0;
    const timestamps = [
      "2026-03-11T16:05:00.000Z",
      "2026-03-11T16:06:00.000Z"
    ];
    const app = createAdminBackupApp({
      maxHistory: 5,
      now: () => timestamps[Math.min(tick++, timestamps.length - 1)]
    });
    const local = createEnvelope("1");
    const remote = createEnvelope("2", {
      base_snapshot_id: local.snapshot_id
    });

    await app.inject({
      method: "PUT",
      url: "/admin/backups/latest",
      headers: {
        "x-admin-token": "secret-metrics-token"
      },
      payload: local
    });
    await app.inject({
      method: "PUT",
      url: "/admin/backups/latest",
      headers: {
        "x-admin-token": "secret-metrics-token"
      },
      payload: remote
    });

    const res = await app.inject({
      method: "POST",
      url: "/admin/backups/compare",
      headers: {
        "x-admin-token": "secret-metrics-token"
      },
      payload: {
        local_summary: toLocalSummary(local)
      }
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      local_status: "summary",
      remote_status: "available",
      comparison_result: "remote_newer",
      local_snapshot: {
        summary: toLocalSummary(local)
      },
      remote_snapshot: {
        summary: {
          stored_at: "2026-03-11T16:06:00.000Z",
          schema_version: remote.schema_version,
          created_at: remote.created_at,
          updated_at: remote.updated_at,
          app_version: remote.app_version,
          checksum: remote.checksum,
          conversation_count: remote.conversations.length,
          snapshot_id: remote.snapshot_id,
          device_id: remote.device_id,
          is_protected: false,
          base_snapshot_id: remote.base_snapshot_id
        }
      },
      build: buildIdentity
    });
  });

  it("writes a guarded backup when the expected remote snapshot matches", async () => {
    let tick = 0;
    const timestamps = [
      "2026-03-11T16:05:00.000Z",
      "2026-03-11T16:06:00.000Z"
    ];
    const app = createAdminBackupApp({
      maxHistory: 5,
      now: () => timestamps[Math.min(tick++, timestamps.length - 1)]
    });
    const first = createEnvelope("1");
    const second = createEnvelope("2", {
      base_snapshot_id: first.snapshot_id
    });

    await app.inject({
      method: "PUT",
      url: "/admin/backups/latest",
      headers: {
        "x-admin-token": "secret-metrics-token"
      },
      payload: first
    });

    const res = await app.inject({
      method: "POST",
      url: "/admin/backups/guarded",
      headers: {
        "x-admin-token": "secret-metrics-token"
      },
      payload: {
        envelope: second,
        expected_remote_snapshot_id: first.snapshot_id,
        expected_remote_checksum: first.checksum
      }
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      guarded_write: "written",
      backup: {
        stored_at: "2026-03-11T16:06:00.000Z",
        schema_version: second.schema_version,
        created_at: second.created_at,
        updated_at: second.updated_at,
        app_version: second.app_version,
        checksum: second.checksum,
        conversation_count: second.conversations.length,
        snapshot_id: second.snapshot_id,
        device_id: second.device_id,
        is_protected: false,
        base_snapshot_id: second.base_snapshot_id
      },
      build: buildIdentity
    });
  });

  it("returns 409 from guarded writes when the remote snapshot changed", async () => {
    let tick = 0;
    const timestamps = [
      "2026-03-11T16:05:00.000Z",
      "2026-03-11T16:06:00.000Z"
    ];
    const app = createAdminBackupApp({
      maxHistory: 5,
      now: () => timestamps[Math.min(tick++, timestamps.length - 1)]
    });
    const first = createEnvelope("1");
    const second = createEnvelope("2", {
      base_snapshot_id: first.snapshot_id
    });

    await app.inject({
      method: "PUT",
      url: "/admin/backups/latest",
      headers: {
        "x-admin-token": "secret-metrics-token"
      },
      payload: first
    });
    await app.inject({
      method: "PUT",
      url: "/admin/backups/latest",
      headers: {
        "x-admin-token": "secret-metrics-token"
      },
      payload: second
    });

    const res = await app.inject({
      method: "POST",
      url: "/admin/backups/guarded",
      headers: {
        "x-admin-token": "secret-metrics-token"
      },
      payload: {
        envelope: first,
        expected_remote_snapshot_id: first.snapshot_id,
        expected_remote_checksum: first.checksum
      }
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.payload)).toEqual({
      guarded_write: "conflict",
      comparison_result: "remote_newer",
      expected_remote_snapshot_id: first.snapshot_id,
      actual_remote_snapshot: {
        summary: {
          stored_at: "2026-03-11T16:06:00.000Z",
          schema_version: second.schema_version,
          created_at: second.created_at,
          updated_at: second.updated_at,
          app_version: second.app_version,
          checksum: second.checksum,
          conversation_count: second.conversations.length,
          snapshot_id: second.snapshot_id,
          device_id: second.device_id,
          is_protected: false,
          base_snapshot_id: second.base_snapshot_id
        }
      },
      build: buildIdentity
    });
  });
});
