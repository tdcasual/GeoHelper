import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CHAT_STORE_KEY, loadChatSnapshot } from "./chat-persistence";

const createMemoryStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    }
  };
};

describe("chat-persistence", () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createMemoryStorage()
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage
    });
  });

  it("restores persisted studio result metadata from chat snapshots", () => {
    localStorage.setItem(
      CHAT_STORE_KEY,
      JSON.stringify({
        mode: "byok",
        sessionToken: null,
        activeConversationId: "conv_1",
        messages: [],
        reauthRequired: false,
        conversations: [
          {
            id: "conv_1",
            title: "Triangle",
            createdAt: 1,
            updatedAt: 2,
            messages: [
              {
                id: "msg_1",
                role: "assistant",
                content: "已创建三角形 ABC",
                result: {
                  status: "success",
                  commandCount: 1,
                  summaryItems: ["已创建三角形 ABC"],
                  explanationLines: [],
                  warningItems: [],
                  uncertaintyItems: [
                    {
                      label: "点 D 在线段 BC 上"
                    }
                  ],
                  canvasLinks: [
                    {
                      id: "link_unc_1",
                      scope: "uncertainty",
                      text: "点 D 在线段 BC 上",
                      objectLabels: ["D", "B", "C"],
                      uncertaintyId: "unc_point_d"
                    },
                    {
                      id: "link_invalid",
                      scope: "summary",
                      text: "",
                      objectLabels: []
                    }
                  ]
                }
              }
            ]
          }
        ]
      })
    );

    const snapshot = loadChatSnapshot();
    const result = snapshot.conversations[0]?.messages[0]?.result;

    expect(result?.status).toBe("success");
    expect(result?.summaryItems).toEqual(["已创建三角形 ABC"]);
    expect(result?.uncertaintyItems[0]?.reviewStatus).toBe("pending");
    expect(result?.uncertaintyItems[0]?.followUpPrompt).toContain(
      "点 D 在线段 BC 上"
    );
    expect(result?.canvasLinks).toEqual([
      {
        id: "link_unc_1",
        scope: "uncertainty",
        text: "点 D 在线段 BC 上",
        objectLabels: ["D", "B", "C"],
        uncertaintyId: "unc_point_d"
      }
    ]);
  });

  it("keeps old snapshots readable when result metadata is missing", () => {
    localStorage.setItem(
      CHAT_STORE_KEY,
      JSON.stringify({
        mode: "byok",
        sessionToken: null,
        activeConversationId: "conv_legacy",
        messages: [],
        reauthRequired: false,
        conversations: [
          {
            id: "conv_legacy",
            title: "Legacy",
            createdAt: 1,
            updatedAt: 2,
            messages: [
              {
                id: "msg_legacy",
                role: "assistant",
                content: "已生成 1 条指令"
              }
            ]
          }
        ]
      })
    );

    const snapshot = loadChatSnapshot();
    const message = snapshot.conversations[0]?.messages[0];

    expect(message?.content).toBe("已生成 1 条指令");
    expect(message?.result).toBeUndefined();
  });
});
