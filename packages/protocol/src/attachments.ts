import { z } from "zod";

export const MAX_IMAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const IMAGE_DATA_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i;

export const RuntimeAttachmentSchema = z
  .object({
    id: z.string().trim().min(1),
    kind: z.literal("image"),
    name: z.string().trim().min(1),
    mimeType: z.string().trim().regex(/^image\/[a-z0-9.+-]+$/i),
    size: z.number().int().nonnegative().max(MAX_IMAGE_ATTACHMENT_BYTES),
    previewUrl: z.string().trim().min(1).optional(),
    transportPayload: z.string().trim().regex(IMAGE_DATA_URL_PATTERN)
  })
  .strict();

export const ImageAttachmentSchema = RuntimeAttachmentSchema;

export type RuntimeAttachment = z.infer<typeof RuntimeAttachmentSchema>;
export type ImageAttachment = RuntimeAttachment;

export const parseRuntimeAttachments = (
  value: unknown
): RuntimeAttachment[] => z.array(RuntimeAttachmentSchema).parse(value);
