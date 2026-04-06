import { z } from "zod";

const TimestampSchema = z.string().min(1);

export const MemoryScopeSchema = z.enum([
  "thread",
  "workspace",
  "domain",
  "policy"
]);

export const MemoryEntrySchema = z.object({
  id: z.string().min(1),
  scope: MemoryScopeSchema,
  scopeId: z.string().min(1),
  key: z.string().min(1),
  value: z.unknown(),
  sourceRunId: z.string().min(1).optional(),
  sourceArtifactId: z.string().min(1).optional(),
  createdAt: TimestampSchema
});

export type MemoryScope = z.infer<typeof MemoryScopeSchema>;
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;
