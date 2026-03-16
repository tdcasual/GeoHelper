import { describe, expect, it } from "vitest";

import {
  buildConversationTitle,
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
});
