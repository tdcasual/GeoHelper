import type { LoadedPortableAgentBundle } from "@geohelper/agent-bundle";
import { createMemoryRetriever, type MemoryLookup } from "@geohelper/agent-memory";
import type { Artifact, MemoryEntry } from "@geohelper/agent-protocol";
import type { AgentStore } from "@geohelper/agent-store";

import { createContextAssembler } from "./context-assembler";
import type {
  ContextAssembler,
  ContextAssemblyInput,
  ContextBundlePacket,
  ContextConversationMessage,
  ToolManifest
} from "./context-types";
import type { StoreBackedToolDefinition } from "./store-backed-context-assembler";

export interface CreatePortableContextAssemblerOptions<
  TToolDefinition extends StoreBackedToolDefinition = StoreBackedToolDefinition
> {
  store: Pick<AgentStore, "artifacts" | "memory">;
  tools: Record<string, TToolDefinition>;
  resolveBundle?: (
    input: ContextAssemblyInput
  ) => LoadedPortableAgentBundle | null | Promise<LoadedPortableAgentBundle | null>;
  loadConversation?: (
    input: ContextAssemblyInput
  ) =>
    | Promise<ContextConversationMessage[]>
    | ContextConversationMessage[];
  loadWorkspace?: (
    input: ContextAssemblyInput,
    bundle: LoadedPortableAgentBundle | null
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
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

const toContextBundlePacket = (
  bundle: LoadedPortableAgentBundle
): ContextBundlePacket => ({
  manifest: bundle.manifest,
  workspaceFiles: Object.fromEntries(
    bundle.workspaceFiles.map((asset) => [asset.relativePath, asset.content])
  ),
  prompts: Object.fromEntries(
    bundle.promptFiles.map((asset) => [asset.relativePath, asset.content])
  ),
  contextPolicy: bundle.contextPolicy,
  memoryPolicy: bundle.memoryPolicy,
  approvalPolicy: bundle.approvalPolicy,
  outputContract: bundle.outputContract,
  delegationConfig: bundle.delegationConfig
});

const readWorkspaceContent = (
  bundle: LoadedPortableAgentBundle,
  suffix: string
): string | null => {
  const asset = bundle.workspaceFiles.find((item) =>
    item.relativePath.endsWith(suffix)
  );

  return asset?.content ?? null;
};

const composeSystem = (bundle: LoadedPortableAgentBundle | null): string => {
  if (!bundle || bundle.contextPolicy.includeWorkspaceBootstrap !== true) {
    return "";
  }

  return [
    readWorkspaceContent(bundle, "AGENTS.md"),
    readWorkspaceContent(bundle, "IDENTITY.md")
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n\n");
};

const composeInstructions = (
  bundle: LoadedPortableAgentBundle | null
): string[] => {
  if (!bundle || bundle.contextPolicy.includeWorkspaceBootstrap !== true) {
    return [];
  }

  return [
    readWorkspaceContent(bundle, "USER.md"),
    readWorkspaceContent(bundle, "TOOLS.md"),
    readWorkspaceContent(bundle, "MEMORY.md"),
    readWorkspaceContent(bundle, "STANDING_ORDERS.md")
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
};

const listArtifacts = async (
  store: Pick<AgentStore, "artifacts">,
  run: ContextAssemblyInput["run"]
): Promise<Artifact[]> => {
  const artifactIds = unique([...run.inputArtifactIds, ...run.outputArtifactIds]);
  const artifacts = await Promise.all(
    artifactIds.map((artifactId) => store.artifacts.getArtifact(artifactId))
  );

  return artifacts.filter((artifact): artifact is Artifact => artifact !== null);
};

const filterArtifacts = (
  artifacts: Artifact[],
  bundle: LoadedPortableAgentBundle | null
): Artifact[] => {
  const allowedKinds = bundle?.contextPolicy.artifactKinds ?? [];

  if (allowedKinds.length === 0) {
    return artifacts;
  }

  return artifacts.filter((artifact) => allowedKinds.includes(artifact.kind));
};

const listRelevantMemories = async (
  store: Pick<AgentStore, "memory">,
  input: {
    threadId: string;
    workspaceId?: string;
    bundle: LoadedPortableAgentBundle | null;
  }
): Promise<MemoryEntry[]> => {
  const retriever = createMemoryRetriever({
    memoryRepo: store.memory
  });
  const scopes = input.bundle?.contextPolicy.memoryScopes ?? ["workspace", "thread"];
  const lookups: MemoryLookup[] = [];

  for (const scope of scopes) {
    if (scope === "thread") {
      lookups.push({
        scope: "thread",
        scopeId: input.threadId
      });
      continue;
    }

    if (scope === "workspace") {
      if (input.workspaceId) {
        lookups.push({
          scope: "workspace",
          scopeId: input.workspaceId
        });
      }
      continue;
    }

    if (!input.bundle) {
      continue;
    }

    lookups.push({
      scope,
      scopeId: input.bundle.manifest.id
    });
  }
  const rankedEntries = await retriever.forLookups(lookups);

  return rankedEntries.map((item) => item.entry);
};

const trimConversation = (
  conversation: ContextConversationMessage[],
  bundle: LoadedPortableAgentBundle | null
): ContextConversationMessage[] => {
  const maxMessages = bundle?.contextPolicy.maxConversationMessages;

  if (
    typeof maxMessages !== "number" ||
    maxMessages <= 0 ||
    conversation.length <= maxMessages
  ) {
    return conversation;
  }

  return conversation.slice(-maxMessages);
};

export interface CreatePortableContextAssemblerOptions<
  TToolDefinition extends StoreBackedToolDefinition = StoreBackedToolDefinition
> {
  store: Pick<AgentStore, "artifacts" | "memory">;
  tools: Record<string, TToolDefinition>;
  resolveBundle?: (
    input: ContextAssemblyInput
  ) => LoadedPortableAgentBundle | null | Promise<LoadedPortableAgentBundle | null>;
  loadConversation?: (
    input: ContextAssemblyInput
  ) =>
    | Promise<ContextConversationMessage[]>
    | ContextConversationMessage[];
  loadWorkspace?: (
    input: ContextAssemblyInput,
    bundle: LoadedPortableAgentBundle | null
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

export const createPortableContextAssembler = <
  TToolDefinition extends StoreBackedToolDefinition = StoreBackedToolDefinition
>({
  store,
  tools,
  resolveBundle,
  loadConversation,
  loadWorkspace
}: CreatePortableContextAssemblerOptions<TToolDefinition>): ContextAssembler => {
  const bundleCache = new WeakMap<
    ContextAssemblyInput,
    Promise<LoadedPortableAgentBundle | null>
  >();
  const getBundle = (
    input: ContextAssemblyInput
  ): Promise<LoadedPortableAgentBundle | null> => {
    const cached = bundleCache.get(input);

    if (cached) {
      return cached;
    }

    const next = Promise.resolve(resolveBundle?.(input) ?? null);
    bundleCache.set(input, next);

    return next;
  };

  return createContextAssembler({
    loadSystem: async (input) => composeSystem(await getBundle(input)),
    loadInstructions: async (input) =>
      composeInstructions(await getBundle(input)),
    loadConversation: async (input) =>
      trimConversation((await loadConversation?.(input)) ?? [], await getBundle(input)),
    loadArtifacts: async (input) =>
      filterArtifacts(await listArtifacts(store, input.run), await getBundle(input)),
    loadMemories: async (input) =>
      listRelevantMemories(store, {
        threadId: input.threadId,
        workspaceId: input.workspaceId,
        bundle: await getBundle(input)
      }),
    loadWorkspace: async (input) => {
      const bundle = await getBundle(input);

      return {
        ...((await loadWorkspace?.(input, bundle)) ?? {}),
        ...(bundle
          ? {
              bundleId: bundle.manifest.id,
              hostRequirements: bundle.manifest.hostRequirements
            }
          : {})
      };
    },
    loadToolCatalog: async () => buildToolCatalog(tools),
    loadBundle: async (input) => {
      const bundle = await getBundle(input);

      return bundle ? toContextBundlePacket(bundle) : null;
    }
  });
};
