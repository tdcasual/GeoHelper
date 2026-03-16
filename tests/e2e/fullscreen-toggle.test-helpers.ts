import type { Page } from "@playwright/test";

type ViewportSize = {
  width: number;
  height: number;
};

export const openWorkspace = async (page: Page) => {
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
};

export const openWorkspaceAt = async (page: Page, viewport: ViewportSize) => {
  await page.setViewportSize(viewport);
  await openWorkspace(page);
};

export const openCompactChatWorkspace = async (
  page: Page,
  viewport: ViewportSize
) => {
  await openWorkspaceAt(page, viewport);
  await page.getByTestId("mobile-surface-chat").click();
};

export const mockFullscreenApi = async (page: Page) => {
  await page.addInitScript(() => {
    let fullscreenElement: Element | null = null;

    Object.defineProperty(Document.prototype, "fullscreenElement", {
      configurable: true,
      get() {
        return fullscreenElement;
      }
    });

    Object.defineProperty(Document.prototype, "fullscreenEnabled", {
      configurable: true,
      get() {
        return true;
      }
    });

    Element.prototype.requestFullscreen = async function requestFullscreen() {
      fullscreenElement = this;
      document.dispatchEvent(new Event("fullscreenchange"));
    };

    Document.prototype.exitFullscreen = async function exitFullscreen() {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    };
  });
};

export const seedChatSnapshot = async (page: Page, snapshot: unknown) => {
  await page.addInitScript((value) => {
    localStorage.setItem("geohelper.chat.snapshot", JSON.stringify(value));
  }, snapshot);
};
