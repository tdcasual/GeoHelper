import { describe, expect, it } from "vitest";

import {
  buildConversationTitle,
  buildStateWithAssistantMessage,
  createConversationThread,
  moveConversationToTop,
  normalizeSendInput
} from "./chat-store-helpers";

describe("chat-store helpers", () => {
  it("builds attachment-aware fallback titles", () => {
    expect(
      buildConversationTitle({
        content: "",
        attachments: [
          {
            id: "img_1",
            kind: "image",
            name: "triangle.png",
            mimeType: "image/png",
            size: 1234,
            previewUrl: "blob:triangle",
            transportPayload: "data:image/png;base64,AAAA"
          }
        ]
      })
    ).toBe("图片消息");
  });

  it("moves updated conversations to the top", () => {
    const first = createConversationThread("A");
    const second = createConversationThread("B");

    expect(moveConversationToTop([first, second], second)[0]?.id).toBe(second.id);
  });

  it("normalizes string send inputs", () => {
    expect(normalizeSendInput("hello")).toEqual({
      content: "hello",
      attachments: []
    });
  });

  it("preserves structured result metadata when assistant messages are appended", () => {
    const conversation = createConversationThread("Triangle");
    const next = buildStateWithAssistantMessage(
      {
        mode: "byok",
        sessionToken: null,
        conversations: [conversation],
        activeConversationId: conversation.id,
        messages: [],
        reauthRequired: false
      },
      conversation.id,
      {
        id: "msg_assistant_1",
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
              id: "unc_d",
              label: "点 D 在线段 BC 上",
              reviewStatus: "pending",
              followUpPrompt: "请确认点 D 是否在线段 BC 上。"
            }
          ],
          canvasLinks: [
            {
              id: "link_unc_d",
              scope: "uncertainty",
              text: "点 D 在线段 BC 上",
              objectLabels: ["D", "B", "C"],
              uncertaintyId: "unc_d"
            }
          ]
        }
      }
    );

    expect(next.messages[0]?.result?.status).toBe("success");
    expect(next.messages[0]?.result?.uncertaintyItems[0]?.id).toBe("unc_d");
    expect(next.messages[0]?.result?.uncertaintyItems[0]?.reviewStatus).toBe(
      "pending"
    );
    expect(next.messages[0]?.result?.canvasLinks[0]?.id).toBe("link_unc_d");
  });
});
