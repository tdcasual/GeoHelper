import {
  RunBudgetSchema,
  type WorkflowDefinition,
  WorkflowDefinitionSchema} from "@geohelper/agent-protocol";
import { z } from "zod";

export const PortableWorkspaceFileSchema = z.object({
  bootstrapFiles: z.array(z.string().min(1)).default([])
});

export const PortableEntrypointSchema = z.object({
  plannerPrompt: z.string().min(1).optional(),
  executorPrompt: z.string().min(1).optional(),
  synthesizerPrompt: z.string().min(1).optional()
});

export const PortableRunProfileManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  workflowId: z.string().min(1).optional(),
  defaultBudget: RunBudgetSchema.optional()
});

export const PortableOpenClawExportSchema = z.object({
  mode: z.enum(["native-tool", "plugin", "host-bound", "unsupported"]),
  preferredTransport: z.string().min(1).optional()
});

export const PortableToolManifestSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["browser", "server", "worker", "external"]),
  description: z.string().min(1),
  inputSchemaRef: z.string().min(1).optional(),
  outputSchemaRef: z.string().min(1).optional(),
  permissions: z.array(z.string().min(1)).default([]),
  retryable: z.boolean().default(false),
  timeoutMs: z.number().int().positive().optional(),
  hostCapability: z.string().min(1).optional(),
  export: z.object({
    openClaw: PortableOpenClawExportSchema.optional()
  }).default({})
});

export const PortableEvaluatorManifestSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  promptRef: z.string().min(1).optional(),
  inputContract: z.object({
    artifactKinds: z.array(z.string().min(1)).default([])
  }).default({
    artifactKinds: []
  }),
  policy: z.object({
    minimumScore: z.number().min(0).max(1).optional(),
    checkpointOnFailure: z.boolean().default(false)
  }).default({
    checkpointOnFailure: false
  })
});

export const PortableContextPolicySchema = z.object({
  includeWorkspaceBootstrap: z.boolean().default(true),
  memoryScopes: z.array(
    z.enum(["thread", "workspace", "domain", "policy"])
  ).default(["thread", "workspace"]),
  artifactKinds: z.array(z.string().min(1)).default([]),
  maxConversationMessages: z.number().int().positive().optional()
});

export const PortableMemoryPromotionRuleSchema = z.object({
  from: z.enum(["thread", "workspace", "domain", "policy"]),
  to: z.enum(["thread", "workspace", "domain", "policy"]),
  when: z.string().min(1)
});

export const PortableMemoryPolicySchema = z.object({
  writableScopes: z.array(
    z.enum(["thread", "workspace", "domain", "policy"])
  ).default(["thread", "workspace"]),
  promotionRules: z.array(PortableMemoryPromotionRuleSchema).default([])
});

export const PortableApprovalRuleSchema = z.object({
  action: z.string().min(1),
  approval: z.enum(["allow", "checkpoint", "deny"])
});

export const PortableApprovalPolicySchema = z.object({
  defaultMode: z.enum(["allow", "allow-with-policy", "checkpoint"]).default(
    "allow-with-policy"
  ),
  rules: z.array(PortableApprovalRuleSchema).default([])
});

export const PortableArtifactOutputContractSchema = z.object({
  response: z.object({
    requiredSections: z.array(z.string().min(1)).default([])
  }).default({
    requiredSections: []
  }),
  actionProposals: z.array(
    z.object({
      kind: z.string().min(1),
      description: z.string().min(1)
    })
  ).default([])
});

export const PortableDelegationEntrySchema = z.object({
  name: z.string().min(1),
  mode: z.enum(["native-subagent", "acp-agent", "host-service"]),
  agentRef: z.string().min(1).optional(),
  serviceRef: z.string().min(1).optional(),
  awaitCompletion: z.boolean().default(true)
});

export const PortableDelegationConfigSchema = z.object({
  delegations: z.array(PortableDelegationEntrySchema).default([])
});

export const PortableAgentManifestSchema = z.object({
  schemaVersion: z.literal("2"),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  entrypoint: PortableEntrypointSchema.default({}),
  workspace: PortableWorkspaceFileSchema.default({
    bootstrapFiles: []
  }),
  workflow: z.object({
    path: z.string().min(1)
  }),
  defaultBudget: RunBudgetSchema,
  runProfiles: z.array(PortableRunProfileManifestSchema).default([]),
  tools: z.array(z.string().min(1)).default([]),
  evaluators: z.array(z.string().min(1)).default([]),
  policies: z.object({
    context: z.string().min(1),
    memory: z.string().min(1),
    approval: z.string().min(1)
  }),
  artifacts: z.object({
    outputContract: z.string().min(1)
  }),
  delegation: z.object({
    config: z.string().min(1)
  }).optional(),
  hostRequirements: z.array(z.string().min(1)).default([]),
  hostExtensions: z.record(z.string(), z.unknown()).default({})
});

export type PortableAgentManifest = z.infer<typeof PortableAgentManifestSchema>;
export type PortableArtifactOutputContract = z.infer<
  typeof PortableArtifactOutputContractSchema
>;
export type PortableApprovalPolicy = z.infer<
  typeof PortableApprovalPolicySchema
>;
export type PortableContextPolicy = z.infer<typeof PortableContextPolicySchema>;
export type PortableDelegationConfig = z.infer<
  typeof PortableDelegationConfigSchema
>;
export type PortableEvaluatorManifest = z.infer<
  typeof PortableEvaluatorManifestSchema
>;
export type PortableMemoryPolicy = z.infer<typeof PortableMemoryPolicySchema>;
export type PortableRunProfileManifest = z.infer<
  typeof PortableRunProfileManifestSchema
>;
export type PortableToolManifest = z.infer<typeof PortableToolManifestSchema>;
export type PortableWorkflowDefinition = WorkflowDefinition;

export const parsePortableWorkflowDefinition = (
  input: unknown
): PortableWorkflowDefinition => WorkflowDefinitionSchema.parse(input);
