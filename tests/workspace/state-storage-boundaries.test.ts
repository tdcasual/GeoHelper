import fs from "node:fs";

import { describe, expect, it } from "vitest";

const countLines = (path: string) =>
  fs.readFileSync(path, "utf8").split(/\r?\n/).length;

describe("state/storage boundaries", () => {
  it("keeps shell components from directly importing storage facades or runtime side effects", () => {
    const settingsDrawer = fs.readFileSync(
      "apps/web/src/components/SettingsDrawer.tsx",
      "utf8"
    );
    const workspaceShell = fs.readFileSync(
      "apps/web/src/components/WorkspaceShell.tsx",
      "utf8"
    );

    expect(settingsDrawer).not.toContain("../storage/backup");
    expect(settingsDrawer).not.toContain("../runtime/runtime-service");
    expect(workspaceShell).not.toContain("../runtime/runtime-service");
  });

  it("keeps state stores delegating to extracted helper modules", () => {
    const settingsStore = fs.readFileSync(
      "apps/web/src/state/settings-store.ts",
      "utf8"
    );
    const chatStore = fs.readFileSync("apps/web/src/state/chat-store.ts", "utf8");
    const chatStoreActions = fs.readFileSync(
      "apps/web/src/state/chat-store-actions.ts",
      "utf8"
    );

    expect(settingsStore).toContain("./settings-persistence");
    expect(settingsStore).toContain("./settings-runtime-resolver");
    expect(chatStore).toContain("./chat-persistence");
    expect(chatStore).toContain("./chat-store-helpers");
    expect(chatStore).toContain("./chat-store-actions");
    expect(chatStoreActions).toContain("./chat-send-flow");
    expect(countLines("apps/web/src/state/chat-store.ts")).toBeLessThan(500);
  });
});
