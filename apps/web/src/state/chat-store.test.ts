import { describe, expect, it, vi } from "vitest";

import { createChatStore } from "./chat-store";

describe("chat-store", () => {
  it("stores compile result and appends assistant message", async () => {
    const compile = vi.fn().mockResolvedValue({
      batch: {
        version: "1.0",
        scene_id: "s1",
        transaction_id: "t1",
        commands: [],
        post_checks: [],
        explanations: []
      }
    });
    const store = createChatStore({ compile });

    await store.getState().send("画一个圆");

    expect(store.getState().messages.at(-1)?.role).toBe("assistant");
  });
});
