async function detectInitialSurface(workspaceShell, homepage, entryTimeoutMs) {
  if (await workspaceShell.isVisible()) {
    return "workspace";
  }

  if (await homepage.isVisible()) {
    return "homepage";
  }

  try {
    return await Promise.any([
      workspaceShell
        .waitFor({ state: "visible", timeout: entryTimeoutMs })
        .then(() => "workspace"),
      homepage.waitFor({ state: "visible", timeout: entryTimeoutMs }).then(() => "homepage")
    ]);
  } catch {
    return "unknown";
  }
}

export async function ensureWorkspaceShellVisible(
  page,
  { settleMs = 400, entryTimeoutMs = 2_000 } = {}
) {
  const workspaceShell = page.locator(".workspace-shell");
  const homepage = page.getByTestId("studio-homepage");

  const initialSurface = await detectInitialSurface(
    workspaceShell,
    homepage,
    entryTimeoutMs
  );

  if (initialSurface === "homepage") {
    await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
  }

  await workspaceShell.waitFor({ state: "visible" });

  if (settleMs > 0) {
    await page.waitForTimeout(settleMs);
  }
}
