import { z } from "zod";

import { CommandBatchSchema } from "./schema";

export const AgentRunTargetSchema = z.enum(["gateway", "direct"]);
export const AgentRunModeSchema = z.enum(["byok", "official"]);
export const AgentRunStatusSchema = z.enum([
  "success",
  "needs_review",
  "failed",
  "degraded"
]);
export const AgentRunStageStatusSchema = z.enum([
  "ok",
  "fallback",
  "error",
  "skipped"
]);
export const GeometryReviewVerdictSchema = z.enum(["approve", "revise"]);
export const GeometryPreflightStatusSchema = z.enum(["passed", "failed"]);
export const GeometryTeacherUncertaintyStatusSchema = z.enum([
  "pending",
  "confirmed",
  "needs_fix"
]);
export const GeometryCanvasLinkScopeSchema = z.enum([
  "summary",
  "warning",
  "uncertainty"
]);

export const AgentRunStageSchema = z.object({
  name: z.string().min(1),
  status: AgentRunStageStatusSchema,
  durationMs: z.number().nonnegative(),
  detail: z.string().min(1).optional()
});

export const GeometryTeacherUncertaintySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  followUpPrompt: z.string().min(1),
  reviewStatus: GeometryTeacherUncertaintyStatusSchema
});

export const GeometryCanvasLinkSchema = z.object({
  id: z.string().min(1),
  scope: GeometryCanvasLinkScopeSchema,
  text: z.string().min(1),
  objectLabels: z.array(z.string().min(1)),
  uncertaintyId: z.string().min(1).optional()
});

export const GeometryDraftPackageSchema = z.object({
  normalizedIntent: z.string().min(1),
  assumptions: z.array(z.string().min(1)),
  constructionPlan: z.array(z.string().min(1)),
  namingPlan: z.array(z.string().min(1)),
  commandBatchDraft: CommandBatchSchema,
  teachingOutline: z.array(z.string().min(1)),
  reviewChecklist: z.array(z.string().min(1))
});

export const GeometryReviewReportSchema = z.object({
  reviewer: z.string().min(1).default("geometry-reviewer"),
  verdict: GeometryReviewVerdictSchema,
  summary: z.array(z.string().min(1)).default([]),
  correctnessIssues: z.array(z.string().min(1)).default([]),
  ambiguityIssues: z.array(z.string().min(1)).default([]),
  namingIssues: z.array(z.string().min(1)).default([]),
  teachingIssues: z.array(z.string().min(1)).default([]),
  repairInstructions: z.array(z.string().min(1)).default([]),
  uncertaintyItems: z.array(GeometryTeacherUncertaintySchema).default([])
});

export const GeometryPreflightEvidenceSchema = z.object({
  status: GeometryPreflightStatusSchema,
  issues: z.array(z.string().min(1)),
  referencedLabels: z.array(z.string().min(1)),
  generatedLabels: z.array(z.string().min(1)),
  dependencySummary: z
    .object({
      commandCount: z.number().int().nonnegative(),
      edgeCount: z.number().int().nonnegative()
    })
    .optional()
});

export const GeometryCanvasEvidenceSchema = z.object({
  executedCommandCount: z.number().int().nonnegative(),
  failedCommandIds: z.array(z.string().min(1)).default([]),
  createdLabels: z.array(z.string().min(1)).default([]),
  visibleLabels: z.array(z.string().min(1)).default([]),
  sceneXml: z.string().min(1).optional(),
  viewportSnapshot: z
    .object({
      width: z.number().positive(),
      height: z.number().positive()
    })
    .optional(),
  teacherFocus: z.string().min(1).optional()
});

export const GeometryTeacherPacketSchema = z.object({
  summary: z.array(z.string().min(1)).min(1),
  warnings: z.array(z.string().min(1)),
  uncertainties: z.array(GeometryTeacherUncertaintySchema),
  nextActions: z.array(z.string().min(1)),
  canvasLinks: z.array(GeometryCanvasLinkSchema)
});

export const AgentRunTelemetrySchema = z.object({
  upstreamCallCount: z.number().int().nonnegative(),
  degraded: z.boolean(),
  stages: z.array(AgentRunStageSchema),
  retryCount: z.number().int().nonnegative().default(0)
});

export const AgentRunSchema = z.object({
  id: z.string().min(1),
  target: AgentRunTargetSchema,
  mode: AgentRunModeSchema,
  status: AgentRunStatusSchema,
  iterationCount: z.number().int().nonnegative(),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
  totalDurationMs: z.number().nonnegative()
});

export const AgentRunEnvelopeSchema = z.object({
  run: AgentRunSchema,
  draft: GeometryDraftPackageSchema,
  reviews: z.array(GeometryReviewReportSchema),
  evidence: z.object({
    preflight: GeometryPreflightEvidenceSchema,
    canvas: GeometryCanvasEvidenceSchema.optional()
  }),
  teacherPacket: GeometryTeacherPacketSchema,
  telemetry: AgentRunTelemetrySchema
});

export type AgentRunTarget = z.infer<typeof AgentRunTargetSchema>;
export type AgentRunMode = z.infer<typeof AgentRunModeSchema>;
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;
export type AgentRunStageStatus = z.infer<typeof AgentRunStageStatusSchema>;
export type AgentRunStage = z.infer<typeof AgentRunStageSchema>;
export type GeometryTeacherUncertainty = z.infer<
  typeof GeometryTeacherUncertaintySchema
>;
export type GeometryCanvasLink = z.infer<typeof GeometryCanvasLinkSchema>;
export type GeometryDraftPackage = z.infer<typeof GeometryDraftPackageSchema>;
export type GeometryReviewReport = z.infer<typeof GeometryReviewReportSchema>;
export type GeometryPreflightEvidence = z.infer<
  typeof GeometryPreflightEvidenceSchema
>;
export type GeometryCanvasEvidence = z.infer<typeof GeometryCanvasEvidenceSchema>;
export type GeometryTeacherPacket = z.infer<typeof GeometryTeacherPacketSchema>;
export type AgentRunTelemetry = z.infer<typeof AgentRunTelemetrySchema>;
export type AgentRun = z.infer<typeof AgentRunSchema>;
export type AgentRunEnvelope = z.infer<typeof AgentRunEnvelopeSchema>;
