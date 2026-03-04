import { describe, expect, it } from "vitest";

import { exportBackup, importBackup } from "./backup";

describe("backup", () => {
  it("round-trips conversations and settings", async () => {
    const blob = await exportBackup({
      conversations: [{ id: "c1" }],
      settings: { chatVisible: false }
    });
    const restored = await importBackup(blob);

    expect(restored.conversations[0].id).toBe("c1");
    expect(restored.settings.chatVisible).toBe(false);
  });
});
