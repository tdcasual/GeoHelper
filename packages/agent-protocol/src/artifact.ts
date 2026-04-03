import { z } from "zod";

const TimestampSchema = z.string().min(1);

export const ArtifactKindSchema = z.enum([
  "input",
  "plan",
  "draft",
  "tool_result",
  "evaluation",
  "canvas_evidence",
  "response"
]);

export const ArtifactStorageSchema = z.enum(["inline", "blob"]);

export const ArtifactSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  kind: ArtifactKindSchema,
  contentType: z.string().min(1),
  storage: ArtifactStorageSchema,
  inlineData: z.unknown().optional(),
  blobUri: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: TimestampSchema
});

export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;
export type ArtifactStorage = z.infer<typeof ArtifactStorageSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
