import { createMemoryRetriever } from "@geohelper/agent-memory";
import type { MemoryEntry } from "@geohelper/agent-protocol";
import type { AgentStore } from "@geohelper/agent-store";

import { createContextAssembler } from "./context-assembler";
import type { ContextAssembler, ToolManifest } from "./context-types";

export interface StoreBackedToolDefinition {
  name: string;
  kind: string;
  permissions?: string[];
  retryable?: boolean;
}

export interface CreateStoreBackedContextAssemblerOptions<
  TToolDefinition extends StoreBackedToolDefinition = StoreBackedToolDefinition
> {
  store: Pick<AgentStore, "artifacts" | "memory">;
  tools: Record<string, TToolDefinition>;
}

const unique = <T>(values: T[]): T[] => [...new Set(values)];

const buildToolCatalog = <TToolDefinition extends StoreBackedToolDefinition>(
  tools: Record<string, TToolDefinition>
): ToolManifest[] =>
  Object.values(tools).map((tool) => ({
    name: tool.name,
    kind: tool.kind,
    permissions: tool.permissions ?? [],
    retryable: tool.retryable ?? false
  }));

const listRelevantMemories = async (
  store: Pick<AgentStore, "memory">,
  input: {
    threadId: string;
    workspaceId?: string;
  }
): Promise<MemoryEntry[]> => {
  const retriever = createMemoryRetriever({
    memoryRepo: store.memory
  });
  const lookups = [];

  if (input.workspaceId) {
    lookups.push({
      scope: "workspace" as const,
      scopeId: input.workspaceId
    });
  }

  lookups.push({
    scope: "thread" as const,
    scopeId: input.threadId
  });

  const rankedEntries = await retriever.forLookups(lookups);

  return rankedEntries.map((item) => item.entry);
};

export const createStoreBackedContextAssembler = <
  TToolDefinition extends StoreBackedToolDefinition = StoreBackedToolDefinition
>({
  store,
  tools
}: CreateStoreBackedContextAssemblerOptions<TToolDefinition>): ContextAssembler =>
  createContextAssembler({
    loadArtifacts: async ({ run }) => {
      const artifactIds = unique([
        ...run.inputArtifactIds,
        ...run.outputArtifactIds
      ]);
      const artifacts = await Promise.all(
        artifactIds.map((artifactId) => store.artifacts.getArtifact(artifactId))
      );

      return artifacts.filter((artifact) => artifact !== null);
    },
    loadMemories: ({ threadId, workspaceId }) =>
      listRelevantMemories(store, {
        threadId,
        workspaceId
      }),
    loadToolCatalog: async () => buildToolCatalog(tools)
  });
