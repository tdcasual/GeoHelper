import type { AnyToolDefinition } from "./tool-definition";

export interface ToolRegistry {
  getTool: (name: string) => AnyToolDefinition | null;
}

export const createToolRegistry = (
  definitions: AnyToolDefinition[]
): ToolRegistry => {
  const tools = new Map(definitions.map((definition) => [definition.name, definition]));

  return {
    getTool: (name) => tools.get(name) ?? null
  };
};
