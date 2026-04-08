import type {
  LoadedPortableAgentBundle,
  PortableApprovalPolicy,
  PortableArtifactOutputContract,
  PortableContextPolicy,
  PortableDelegationConfig,
  PortableMemoryPolicy
} from "@geohelper/agent-bundle";
import type { Artifact, MemoryEntry, Run } from "@geohelper/agent-protocol";

export type ContextConversationRole = "system" | "user" | "assistant";

export interface ContextConversationMessage {
  role: ContextConversationRole;
  content: string;
}

export interface ToolManifest {
  name: string;
  kind: string;
  permissions: string[];
  retryable: boolean;
}

export interface ContextBundlePacket {
  manifest: LoadedPortableAgentBundle["manifest"];
  workspaceFiles: Record<string, string>;
  prompts: Record<string, string>;
  contextPolicy: PortableContextPolicy;
  memoryPolicy: PortableMemoryPolicy;
  approvalPolicy: PortableApprovalPolicy;
  outputContract: PortableArtifactOutputContract;
  delegationConfig: PortableDelegationConfig | null;
}

export interface ContextPacket {
  system: string;
  instructions: string[];
  conversation: ContextConversationMessage[];
  artifacts: Artifact[];
  memories: MemoryEntry[];
  workspace: Record<string, unknown>;
  toolCatalog: ToolManifest[];
  bundle: ContextBundlePacket | null;
}

export interface ContextAssemblyInput {
  run: Run;
  nodeId: string;
  threadId: string;
  workspaceId?: string;
}

export interface ContextAssembler {
  assemble: (input: ContextAssemblyInput) => Promise<ContextPacket>;
}
