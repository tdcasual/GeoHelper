import { ArtifactSchema, type Artifact } from "@geohelper/agent-protocol";
import type { ToolDefinition } from "@geohelper/agent-tools";
import { CommandBatchSchema } from "@geohelper/protocol";
import { z } from "zod";

export const SceneApplyCommandBatchInputSchema = z.object({
  runId: z.string().min(1),
  sourceArtifactId: z.string().min(1),
  createdAt: z.string().min(1).optional(),
  commandBatch: CommandBatchSchema
});

export type SceneApplyCommandBatchInput = z.infer<
  typeof SceneApplyCommandBatchInputSchema
>;

export const createSceneApplyCommandBatchTool = (): ToolDefinition<
  SceneApplyCommandBatchInput,
  Artifact
> => ({
  name: "scene.apply_command_batch",
  kind: "browser_tool",
  permissions: ["scene:write"],
  retryable: false,
  inputSchema: SceneApplyCommandBatchInputSchema,
  outputSchema: ArtifactSchema,
  execute: async ({
    runId,
    sourceArtifactId,
    createdAt,
    commandBatch
  }) =>
    ArtifactSchema.parse({
      id: `artifact_command_batch_${commandBatch.transaction_id}`,
      runId,
      kind: "tool_result",
      contentType: "application/vnd.geohelper.command-batch+json",
      storage: "inline",
      metadata: {
        domain: "geometry",
        toolName: "scene.apply_command_batch",
        sourceArtifactId,
        sceneId: commandBatch.scene_id,
        transactionId: commandBatch.transaction_id,
        commandCount: commandBatch.commands.length
      },
      inlineData: {
        commandBatch
      },
      createdAt: createdAt ?? new Date().toISOString()
    })
});
