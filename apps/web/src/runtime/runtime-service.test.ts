import { afterEach, describe, expect, it, vi } from "vitest";

import {
  protectGatewayBackupSnapshot,
  uploadGatewayBackupGuarded
} from "./runtime-service";

const build = {
  git_sha: "sha123",
  build_time: "2026-04-04T00:00:00.000Z",
  node_env: "test",
  redis_enabled: true,
  attachments_enabled: false
};

const remoteSummary = {
  stored_at: "2026-04-04T00:06:00.000Z",
  schema_version: 3,
  created_at: "2026-04-04T00:00:00.000Z",
  updated_at: "2026-04-04T00:05:00.000Z",
  app_version: "0.0.1",
  checksum: "checksum-remote",
  conversation_count: 2,
  snapshot_id: "snap-remote",
  device_id: "device-remote",
  is_protected: false
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runtime service backup conflict handling", () => {
  it("returns guarded upload conflict payloads without collapsing them into generic errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        statusText: "Conflict",
        json: async () => ({
          guarded_write: "conflict",
          comparison_result: "remote_newer",
          expected_remote_snapshot_id: null,
          actual_remote_snapshot: {
            summary: remoteSummary
          },
          build
        })
      })
    );

    await expect(
      uploadGatewayBackupGuarded({
        baseUrl: "https://gateway.example.com",
        adminToken: "admin-secret",
        envelope: {
          schema_version: 3,
          created_at: "2026-04-04T00:00:00.000Z",
          updated_at: "2026-04-04T00:05:00.000Z",
          app_version: "0.0.1",
          snapshot_id: "snap-local",
          device_id: "device-local",
          checksum: "checksum-local",
          conversations: [],
          settings: {}
        }
      })
    ).resolves.toEqual(
      expect.objectContaining({
        guarded_write: "conflict",
        comparison_result: "remote_newer"
      })
    );
  });

  it("returns protection limit payloads without collapsing them into generic errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        statusText: "Conflict",
        json: async () => ({
          protection_status: "limit_reached",
          snapshot_id: "snap-remote-1",
          protected_count: 1,
          max_protected: 1,
          build
        })
      })
    );

    await expect(
      protectGatewayBackupSnapshot({
        baseUrl: "https://gateway.example.com",
        adminToken: "admin-secret",
        snapshotId: "snap-remote-1"
      })
    ).resolves.toEqual(
      expect.objectContaining({
        protection_status: "limit_reached",
        protected_count: 1,
        max_protected: 1
      })
    );
  });
});
