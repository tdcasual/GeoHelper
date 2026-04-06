import { CommandBatchSchema } from "@geohelper/protocol";
import { z } from "zod";

export const BrowserToolRequestSchema = z.discriminatedUnion("toolName", [
  z.object({
    sessionId: z.string().min(1),
    requestId: z.string().min(1),
    toolName: z.literal("scene.read_state"),
    payload: z.object({
      sceneId: z.string().min(1).optional()
    })
  }),
  z.object({
    sessionId: z.string().min(1),
    requestId: z.string().min(1),
    toolName: z.literal("scene.apply_command_batch"),
    payload: z.object({
      commandBatch: CommandBatchSchema
    })
  }),
  z.object({
    sessionId: z.string().min(1),
    requestId: z.string().min(1),
    toolName: z.literal("scene.capture_snapshot"),
    payload: z.object({
      includeXml: z.boolean().default(true)
    })
  })
]);

export const BrowserToolResultSchema = z.object({
  sessionId: z.string().min(1),
  requestId: z.string().min(1),
  toolName: z.string().min(1),
  status: z.enum(["completed", "failed"]),
  output: z.unknown()
});

export type BrowserToolRequest = z.infer<typeof BrowserToolRequestSchema>;
export type BrowserToolResult = z.infer<typeof BrowserToolResultSchema>;
