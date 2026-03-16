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
    const settingsDataSection = fs.readFileSync(
      "apps/web/src/components/settings-drawer/SettingsDataSection.tsx",
      "utf8"
    );
    const canvasPanel = fs.readFileSync(
      "apps/web/src/components/CanvasPanel.tsx",
      "utf8"
    );
    const remoteBackupControls = fs.readFileSync(
      "apps/web/src/components/settings-drawer/useRemoteBackupControls.ts",
      "utf8"
    );

    expect(workspaceShell).toContain("./workspace-shell/WorkspaceConversationSidebar");
    expect(workspaceShell).toContain("./workspace-shell/WorkspaceChatMessages");
    expect(workspaceShell).toContain("./workspace-shell/WorkspaceChatComposer");
    expect(workspaceShell).toContain("./workspace-shell/WorkspaceDesktopLayout");
    expect(workspaceShell).toContain("./workspace-shell/WorkspaceCompactLayout");
    expect(workspaceShell).toContain("./workspace-shell/viewport");
    expect(workspaceShell).toContain("./workspace-shell/history-layout");
    expect(workspaceShell).toContain("./workspace-shell/useWorkspaceRuntimeSession");
    expect(workspaceShell).toContain("./workspace-shell/useWorkspaceComposer");
    expect(settingsDrawer).toContain("./settings-drawer/SettingsGeneralSection");
    expect(settingsDrawer).toContain("./settings-drawer/SettingsModelsSection");
    expect(settingsDrawer).toContain("./settings-drawer/SettingsSessionSection");
    expect(settingsDrawer).toContain("./settings-drawer/SettingsDataSection");
    expect(settingsDrawer).toContain("./settings-drawer/useRemoteBackupControls");
    expect(settingsDataSection).toContain("./data-section/LocalBackupSection");
    expect(settingsDataSection).toContain("./data-section/ImportRollbackSection");
    expect(settingsDataSection).toContain("./data-section/RemoteBackupSection");
    expect(settingsDataSection).toContain("./data-section/DataMaintenanceSection");
    expect(canvasPanel).toContain("./canvas-panel/runtime");
    expect(canvasPanel).toContain("./canvas-panel/scene-sync");
    expect(settingsDrawer).not.toContain("../storage/backup");
    expect(remoteBackupControls).toContain("./remote-backup/import-actions");
    expect(remoteBackupControls).toContain("./remote-backup/sync-actions");
    expect(remoteBackupControls).toContain("./remote-backup/derived-state");

    expect(
      countLines("apps/web/src/components/WorkspaceShell.tsx")
    ).toBeLessThan(500);
    expect(
      countLines("apps/web/src/components/SettingsDrawer.tsx")
    ).toBeLessThan(500);
    expect(
      countLines("apps/web/src/components/settings-drawer/useRemoteBackupControls.ts")
    ).toBeLessThan(500);
    expect(
      countLines("apps/web/src/components/settings-drawer/SettingsDataSection.tsx")
    ).toBeLessThan(400);
    expect(countLines("apps/web/src/components/CanvasPanel.tsx")).toBeLessThan(400);
    expect(
      countLines("apps/web/src/components/settings-remote-backup.ts")
    ).toBeLessThan(120);
  });
});
