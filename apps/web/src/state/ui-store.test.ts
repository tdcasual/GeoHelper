import { describe, expect, it } from "vitest";
import { createUIStore } from "./ui-store";

describe("ui-store", () => {
  it("toggles chat panel visibility", () => {
    const store = createUIStore();

    expect(store.getState().chatVisible).toBe(true);
    store.getState().toggleChat();
    expect(store.getState().chatVisible).toBe(false);
  });

  it("hides history drawer by default", () => {
    const store = createUIStore();

    expect(store.getState().historyDrawerVisible).toBe(false);
  });

  it("toggles history drawer visibility", () => {
    const store = createUIStore();

    store.getState().toggleHistoryDrawer();
    expect(store.getState().historyDrawerVisible).toBe(true);

    store.getState().setHistoryDrawerVisible(false);
    expect(store.getState().historyDrawerVisible).toBe(false);
  });

  it("stores history drawer width within bounds", () => {
    const store = createUIStore();

    expect(store.getState().historyDrawerWidth).toBe(280);

    store.getState().setHistoryDrawerWidth(120);
    expect(store.getState().historyDrawerWidth).toBe(189);

    store.getState().setHistoryDrawerWidth(900);
    expect(store.getState().historyDrawerWidth).toBe(420);
  });
});
