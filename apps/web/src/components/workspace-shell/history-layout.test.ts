import { describe, expect, it } from "vitest";

import { resolveHistoryDrawerLayout } from "./history-layout";

describe("workspace history layout", () => {
  it("switches to overlay sizing when inline history would crush the chat width", () => {
    expect(
      resolveHistoryDrawerLayout({
        compactViewport: false,
        chatShellWidth: 540,
        historyDrawerWidth: 320
      })
    ).toMatchObject({
      desktopHistoryOverlay: true
    });
  });
});
