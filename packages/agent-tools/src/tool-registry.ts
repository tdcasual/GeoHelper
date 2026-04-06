import type { AnyToolDefinition } from "./tool-definition";
import { createToolManifest, type ToolManifest } from "./tool-manifest";

export interface ToolRegistry {
  getTool: (name: string) => AnyToolDefinition | null;
  listTools: () => AnyToolDefinition[];
  listManifests: () => ToolManifest[];
}

export const createToolRegistry = (
  definitions: AnyToolDefinition[]
): ToolRegistry => {
  const tools = new Map(definitions.map((definition) => [definition.name, definition]));

  return {
    getTool: (name) => tools.get(name) ?? null,
    listTools: () => [...tools.values()],
    listManifests: () => [...tools.values()].map((tool) => createToolManifest(tool))
  };
};
