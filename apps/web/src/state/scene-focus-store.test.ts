import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSceneFocusStore } from "./scene-focus-store";

describe("scene-focus-store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("issues one-time focus requests and clears them after timeout", () => {
    const store = createSceneFocusStore();

    const request = store.getState().requestFocus({
      source: "summary",
      objectLabels: ["A", " B ", "A", ""],
      revealCanvas: true,
      ttlMs: 500
    });

    expect(request).toMatchObject({
      source: "summary",
      objectLabels: ["A", "B"],
      revealCanvas: true
    });
    expect(store.getState().focusRequest?.requestId).toBe(request?.requestId);

    vi.advanceTimersByTime(499);
    expect(store.getState().focusRequest?.requestId).toBe(request?.requestId);

    vi.advanceTimersByTime(1);
    expect(store.getState().focusRequest).toBeNull();
  });

  it("consumes pending focus requests exactly once", () => {
    const store = createSceneFocusStore();
    const request = store.getState().requestFocus({
      source: "uncertainty",
      objectLabels: ["D", "B", "C"]
    });

    expect(
      store.getState().consumeFocusRequest(request?.requestId ?? "missing")
    ).toMatchObject({
      requestId: request?.requestId
    });
    expect(store.getState().focusRequest).toBeNull();
    expect(
      store.getState().consumeFocusRequest(request?.requestId ?? "missing")
    ).toBeNull();
  });
});
