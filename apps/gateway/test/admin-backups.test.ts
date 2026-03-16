import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { createEnvelope, toLocalSummary } from "./admin-backups.test-helpers";

describe("admin backup routes facade", () => {
  it("reuses the admin token guard for latest, history, and compare routes", async () => {
    const app = buildServer({
      ADMIN_METRICS_TOKEN: "secret-metrics-token"
    });

    const forbiddenPut = await app.inject({
      method: "PUT",
      url: "/admin/backups/latest",
      payload: createEnvelope()
    });
    expect(forbiddenPut.statusCode).toBe(403);

    const forbiddenGet = await app.inject({
      method: "GET",
      url: "/admin/backups/latest"
    });
    expect(forbiddenGet.statusCode).toBe(403);

    const forbiddenHistory = await app.inject({
      method: "GET",
      url: "/admin/backups/history"
    });
    expect(forbiddenHistory.statusCode).toBe(403);

    const forbiddenCompare = await app.inject({
      method: "POST",
      url: "/admin/backups/compare",
      payload: {
        local_summary: toLocalSummary(createEnvelope())
      }
    });
    expect(forbiddenCompare.statusCode).toBe(403);

    const forbiddenGuarded = await app.inject({
      method: "POST",
      url: "/admin/backups/guarded",
      payload: {
        envelope: createEnvelope(),
        expected_remote_snapshot_id: null
      }
    });
    expect(forbiddenGuarded.statusCode).toBe(403);
  });

  it("keeps the admin backups facade suite below the test maintainability budget", async () => {
    const code = await readFile(new URL("./admin-backups.test.ts", import.meta.url), "utf8");
    expect(code.split(/\r?\n/).length).toBeLessThan(260);
  });
});
