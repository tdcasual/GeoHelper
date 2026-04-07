import { describe, expect, it, vi } from "vitest";

import { ensureWorkspaceShellVisible } from "../../scripts/ui/lib/workspace-bootstrap.mjs";

describe("expanded ui audit workspace bootstrap", () => {
  it("enters the workspace from the homepage before waiting for the shell", async () => {
    const workspaceShell = {
      isVisible: vi.fn().mockResolvedValue(false),
      waitFor: vi.fn().mockResolvedValue(undefined)
    };
    const homepage = {
      isVisible: vi.fn().mockResolvedValue(true),
      waitFor: vi.fn().mockResolvedValue(undefined)
    };
    const startButton = {
      click: vi.fn().mockResolvedValue(undefined)
    };
    const page = {
      locator: vi.fn((selector: string) => {
        expect(selector).toBe(".workspace-shell");
        return workspaceShell;
      }),
      getByTestId: vi.fn((testId: string) => {
        expect(testId).toBe("studio-homepage");
        return homepage;
      }),
      getByRole: vi.fn((role: string, options: { name: string; exact: boolean }) => {
        expect(role).toBe("button");
        expect(options).toEqual({ name: "开始生成图形", exact: true });
        return startButton;
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined)
    };

    await ensureWorkspaceShellVisible(page, { settleMs: 0 });

    expect(startButton.click).toHaveBeenCalledOnce();
    expect(workspaceShell.waitFor).toHaveBeenCalledWith({ state: "visible" });
    expect(page.waitForTimeout).not.toHaveBeenCalled();
  });
});
