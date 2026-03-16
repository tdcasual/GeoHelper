import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { exportBackup, importBackup } from "./backup";

describe("backup facade", () => {
  it("round-trips conversations and settings", async () => {
    const blob = await exportBackup({
      conversations: [{ id: "c1" }],
      settings: { chatVisible: false }
    });
    const restored = await importBackup(blob);

    expect(restored.conversations[0].id).toBe("c1");
    expect(restored.settings.chatVisible).toBe(false);
  });

  it("keeps the backup facade suite below the test maintainability budget", async () => {
    const code = await readFile(new URL("./backup.test.ts", import.meta.url), "utf-8");
    expect(code.split(/\r?\n/).length).toBeLessThan(260);
  });
});
