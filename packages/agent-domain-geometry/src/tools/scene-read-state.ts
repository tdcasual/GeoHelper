import type { ToolDefinition } from "@geohelper/agent-tools";
import { z } from "zod";

export const SceneReadStateInputSchema = z.object({
  workspaceId: z.string().min(1),
  sceneId: z.string().min(1).optional(),
  teacherFocus: z.string().min(1).optional(),
  visibleLabels: z.array(z.string().min(1)).default([])
});

export const SceneReadStateOutputSchema = z.object({
  sceneId: z.string().min(1),
  objectCount: z.number().int().nonnegative(),
  visibleLabels: z.array(z.string().min(1)),
  teacherFocus: z.string().min(1).optional()
});

export type SceneReadStateInput = z.infer<typeof SceneReadStateInputSchema>;
export type SceneReadStateOutput = z.infer<typeof SceneReadStateOutputSchema>;

export const createSceneReadStateTool = (): ToolDefinition<
  SceneReadStateInput,
  SceneReadStateOutput
> => ({
  name: "scene.read_state",
  kind: "browser_tool",
  permissions: ["scene:read"],
  retryable: true,
  inputSchema: SceneReadStateInputSchema,
  outputSchema: SceneReadStateOutputSchema,
  execute: async ({
    sceneId = "active_scene",
    teacherFocus,
    visibleLabels
  }) => ({
    sceneId,
    objectCount: visibleLabels.length,
    visibleLabels,
    teacherFocus
  })
});
