import { describe, expect, it, vi } from "vitest";

import { GatewayApiError } from "../services/api-client";
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
      },
      agent_steps: [
        {
          name: "intent",
          status: "ok",
          duration_ms: 8
        }
      ]
    });
    const store = createChatStore({ compile });

    await store.getState().send("画一个圆");

    const message = store.getState().messages.at(-1);
    expect(message?.role).toBe("assistant");
    expect(message?.agentSteps?.[0]?.name).toBe("intent");
  });

  it("marks reauth required when official session expires", async () => {
    const compile = vi
      .fn()
      .mockRejectedValue(
        new GatewayApiError(
          "SESSION_EXPIRED",
          "Session token is invalid or expired",
          401
        )
      );
    const store = createChatStore({ compile });
    store.getState().setMode("official");
    store.getState().setSessionToken("expired-token");

    await store.getState().send("再画一个圆");

    expect(store.getState().sessionToken).toBeNull();
    expect(store.getState().reauthRequired).toBe(true);
    expect(store.getState().messages.at(-1)?.content).toContain("会话已过期");
  });
});
