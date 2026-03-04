import { describe, expect, it } from "vitest";
import { createUIStore } from "./ui-store";

describe("ui-store", () => {
  it("toggles chat panel visibility", () => {
    const store = createUIStore();

    expect(store.getState().chatVisible).toBe(true);
    store.getState().toggleChat();
    expect(store.getState().chatVisible).toBe(false);
  });
});
