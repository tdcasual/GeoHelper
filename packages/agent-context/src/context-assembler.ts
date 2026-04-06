import type { Artifact, MemoryEntry } from "@geohelper/agent-protocol";

import type {
  ContextAssembler,
  ContextAssemblyInput,
  ContextConversationMessage,
  ContextPacket,
  ToolManifest
} from "./context-types";

type Loader<T> = (input: ContextAssemblyInput) => Promise<T> | T;

export interface ContextAssemblerDeps {
  loadSystem?: Loader<string>;
  loadInstructions?: Loader<string[]>;
  loadConversation?: Loader<ContextConversationMessage[]>;
  loadArtifacts?: Loader<Artifact[]>;
  loadMemories?: Loader<MemoryEntry[]>;
  loadWorkspace?: Loader<Record<string, unknown>>;
  loadToolCatalog?: Loader<ToolManifest[]>;
}

const emptyContextPacket = (): ContextPacket => ({
  system: "",
  instructions: [],
  conversation: [],
  artifacts: [],
  memories: [],
  workspace: {},
  toolCatalog: []
});

export const createContextAssembler = (
  deps: ContextAssemblerDeps = {}
): ContextAssembler => ({
  assemble: async (input) => {
    const base = emptyContextPacket();

    const [
      system,
      instructions,
      conversation,
      artifacts,
      memories,
      workspace,
      toolCatalog
    ] = await Promise.all([
      deps.loadSystem?.(input) ?? base.system,
      deps.loadInstructions?.(input) ?? base.instructions,
      deps.loadConversation?.(input) ?? base.conversation,
      deps.loadArtifacts?.(input) ?? base.artifacts,
      deps.loadMemories?.(input) ?? base.memories,
      deps.loadWorkspace?.(input) ?? base.workspace,
      deps.loadToolCatalog?.(input) ?? base.toolCatalog
    ]);

    return {
      system,
      instructions,
      conversation,
      artifacts,
      memories,
      workspace,
      toolCatalog
    };
  }
});
