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
    const remoteBackupControls = fs.readFileSync(
      "apps/web/src/components/settings-drawer/useRemoteBackupControls.ts",
      "utf8"
    );

    expect(workspaceShell).toContain("./workspace-shell/WorkspaceConversationSidebar");
    expect(workspaceShell).toContain("./workspace-shell/WorkspaceChatMessages");
    expect(workspaceShell).toContain("./workspace-shell/WorkspaceChatComposer");
    expect(workspaceShell).toContain("./workspace-shell/useWorkspaceRuntimeSession");
    expect(workspaceShell).toContain("./workspace-shell/useWorkspaceComposer");
    expect(settingsDrawer).toContain("./settings-drawer/SettingsDataSection");
    expect(settingsDrawer).toContain("./settings-drawer/useRemoteBackupControls");
    expect(settingsDrawer).not.toContain("../storage/backup");
    expect(remoteBackupControls).toContain("./remote-backup/import-actions");
    expect(remoteBackupControls).toContain("./remote-backup/sync-actions");
    expect(remoteBackupControls).toContain("./remote-backup/derived-state");

    expect(
      countLines("apps/web/src/components/WorkspaceShell.tsx")
    ).toBeLessThan(850);
    expect(
      countLines("apps/web/src/components/SettingsDrawer.tsx")
    ).toBeLessThan(1400);
    expect(
      countLines("apps/web/src/components/settings-drawer/useRemoteBackupControls.ts")
    ).toBeLessThan(500);
    expect(
      countLines("apps/web/src/components/settings-remote-backup.ts")
    ).toBeLessThan(120);
  });
});
