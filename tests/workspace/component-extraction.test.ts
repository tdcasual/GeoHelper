import fs from "node:fs";

import { describe, expect, it } from "vitest";

const countLines = (path: string) =>
  fs.readFileSync(path, "utf8").split(/\r?\n/).length;

describe("component extraction progress", () => {
  it("removes the legacy eslint ignore file and splits hotspot components into submodules", () => {
    expect(fs.existsSync(".eslintignore")).toBe(false);

    const workspaceShell = fs.readFileSync(
      "apps/web/src/components/WorkspaceShell.tsx",
      "utf8"
    );
    const settingsDrawer = fs.readFileSync(
      "apps/web/src/components/SettingsDrawer.tsx",
      "utf8"
    );

    expect(workspaceShell).toContain("./workspace-shell/WorkspaceConversationSidebar");
    expect(workspaceShell).toContain("./workspace-shell/WorkspaceChatMessages");
    expect(workspaceShell).toContain("./workspace-shell/WorkspaceChatComposer");
    expect(settingsDrawer).toContain("./settings-drawer/SettingsDataSection");

    expect(
      countLines("apps/web/src/components/WorkspaceShell.tsx")
    ).toBeLessThan(1100);
    expect(
      countLines("apps/web/src/components/SettingsDrawer.tsx")
    ).toBeLessThan(2000);
  });
});
