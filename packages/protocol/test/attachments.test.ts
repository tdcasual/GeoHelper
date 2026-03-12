import { describe, expect, it } from "vitest";

import {
  MAX_IMAGE_ATTACHMENT_BYTES,
  parseRuntimeAttachments,
  RuntimeAttachmentSchema
} from "../src/attachments";

describe("runtime attachment protocol", () => {
  it("accepts a valid image attachment payload", () => {
    const parsed = parseRuntimeAttachments([
      {
        id: "img_1",
        kind: "image",
        name: "triangle.png",
        mimeType: "image/png",
        size: 1234,
        transportPayload: "data:image/png;base64,AAAA",
        previewUrl: "blob:triangle"
      }
    ]);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.mimeType).toBe("image/png");
  });

  it("rejects unsupported mime types and empty payloads", () => {
    expect(() =>
      RuntimeAttachmentSchema.parse({
        id: "img_2",
        kind: "image",
        name: "triangle.pdf",
        mimeType: "application/pdf",
        size: 1234,
        transportPayload: ""
      })
    ).toThrow();
  });

  it("enforces max byte size and data-url shape", () => {
    expect(MAX_IMAGE_ATTACHMENT_BYTES).toBeGreaterThan(1024);

    expect(() =>
      RuntimeAttachmentSchema.parse({
        id: "img_3",
        kind: "image",
        name: "huge.png",
        mimeType: "image/png",
        size: MAX_IMAGE_ATTACHMENT_BYTES + 1,
        transportPayload: "not-a-data-url"
      })
    ).toThrow();
  });
});
