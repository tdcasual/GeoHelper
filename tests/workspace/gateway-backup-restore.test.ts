import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { createBackupEnvelope } from "../../packages/protocol/src/backup.ts";

describe("gateway backup restore smoke", () => {
  it("exposes restore drill script and dry-run plan output", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["smoke:gateway-backup-restore"]).toBeDefined();

    const run = spawnSync(
      "node",
      ["scripts/smoke/gateway-backup-restore.mjs", "--dry-run"],
      {
        encoding: "utf8"
      }
    );

    expect(run.status).toBe(0);
    const payload = JSON.parse(run.stdout.trim()) as {
      dry_run: boolean;
      gateway_url: string | null;
      steps: Array<Record<string, unknown>>;
    };

    expect(payload).toEqual({
      dry_run: true,
      gateway_url: null,
      steps: [
        {
          name: "read_latest_backup",
          method: "GET",
          path: "/admin/backups/latest"
        },
        {
          name: "validate_backup_envelope",
          helper: "parseBackupEnvelope",
          source: "backup.envelope"
        },
        {
          name: "report_restore_metadata",
          fields: [
            "stored_at",
            "schema_version",
            "created_at",
            "app_version",
            "conversation_count"
          ]
        }
      ]
    });
  });

  it("inspects a synthetic latest backup payload and returns compact metadata", () => {
    const envelope = createBackupEnvelope(
      {
        conversations: [
          {
            id: "conv-1",
            title: "Lesson 1"
          }
        ],
        settings: {
          defaultMode: "byok"
        }
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-12T08:00:00.000Z",
        appVersion: "0.0.1"
      }
    );

    const run = spawnSync("node", ["scripts/smoke/gateway-backup-restore.mjs"], {
      encoding: "utf8",
      env: {
        ...process.env,
        GATEWAY_BACKUP_RESTORE_MOCK_RESPONSE_JSON: JSON.stringify({
          backup: {
            stored_at: "2026-03-12T08:05:00.000Z",
            schema_version: 2,
            created_at: "2026-03-12T08:00:00.000Z",
            app_version: "0.0.1",
            checksum: envelope.checksum,
            conversation_count: 1,
            envelope
          },
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T08:04:00.000Z",
            node_env: "test",
            redis_enabled: false
          }
        })
      }
    });

    expect(run.status).toBe(0);
    const payload = JSON.parse(run.stdout.trim()) as {
      dry_run: boolean;
      gateway_url: string | null;
      restore_drill: Record<string, unknown>;
      build: Record<string, unknown>;
    };

    expect(payload).toEqual({
      dry_run: false,
      gateway_url: null,
      restore_drill: {
        stored_at: "2026-03-12T08:05:00.000Z",
        schema_version: 2,
        created_at: "2026-03-12T08:00:00.000Z",
        app_version: "0.0.1",
        conversation_count: 1,
        checksum: envelope.checksum
      },
      build: {
        git_sha: "backupsha",
        build_time: "2026-03-12T08:04:00.000Z",
        node_env: "test",
        redis_enabled: false
      }
    });
  });
});
