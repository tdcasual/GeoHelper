import {
  AgentRunEnvelopeSchema,
  GeometryCanvasEvidenceSchema,
  RuntimeAttachmentSchema
} from "@geohelper/protocol";
import { FastifyInstance } from "fastify";
import { z } from "zod";

import { GatewayConfig } from "../config";
import { createAgentWorkflow } from "../services/agent-workflow";
import { type GatewayBuildInfo } from "../services/build-info";
import {
  buildTraceId,
  type CompileEventSink
} from "../services/compile-events";
import {
  CompileGuard,
  CompileGuardBusyError,
  CompileGuardTimeoutError
} from "../services/compile-guard";
import { createGeometryAuthor } from "../services/geometry-author";
import { createGeometryBrowserRepair } from "../services/geometry-browser-repair";
import { createGeometryPreflight } from "../services/geometry-preflight";
import { createGeometryReviewer } from "../services/geometry-reviewer";
import { createGeometryReviser } from "../services/geometry-reviser";
import {
  type CompileMode,
  type RequestCommandBatch
} from "../services/litellm-client";
import {
  recordAgentRunQualitySample,
  recordCompileFailure,
  recordCompileRateLimited,
  recordCompileSuccess
} from "../services/metrics";
import { type GatewayMetricsStore } from "../services/metrics-store";
import { consumeRateLimit } from "../services/rate-limit";
import { type RateLimitStore } from "../services/rate-limit-store";
import { verifySessionToken } from "../services/session";
import { type SessionRevocationStore } from "../services/session-store";
import {
  buildCompileAlertUpstream,
  toLegacyAgentSteps
} from "./compile-route-agent-adapter";
import { createCompileRouteAlerting } from "./compile-route-alerts";
import {
  mergeCompileMetadata,
  normalizeCompileContext,
  summarizeCompileAttachments,
  toCompileFinalStatusFromAgentRun
} from "./compile-route-helpers";

const AgentRunBodySchema = z.object({
  message: z.string().min(1),
  mode: z.enum(["byok", "official"]),
  model: z.string().optional(),
  attachments: z.array(RuntimeAttachmentSchema).optional(),
  repair: z
    .object({
      sourceRun: AgentRunEnvelopeSchema,
      teacherInstruction: z.string().min(1),
      canvasEvidence: GeometryCanvasEvidenceSchema
    })
    .optional(),
  context: z
    .object({
      recentMessages: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().min(1)
          })
        )
        .optional(),
      recent_messages: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().min(1)
          })
        )
        .optional(),
      sceneTransactions: z
        .array(
          z.object({
            sceneId: z.string().min(1),
            transactionId: z.string().min(1),
            commandCount: z.number().int().nonnegative()
          })
        )
        .optional(),
      scene_transactions: z
        .array(
          z.object({
            scene_id: z.string().min(1),
            transaction_id: z.string().min(1),
            command_count: z.number().int().nonnegative()
          })
        )
        .optional()
    })
    .optional()
});

export interface AgentRunsRouteDeps {
  requestCommandBatch: RequestCommandBatch;
  sessionStore: SessionRevocationStore;
  rateLimitStore: RateLimitStore;
  compileEventSink: CompileEventSink;
  compileGuard: CompileGuard;
  metricsStore: GatewayMetricsStore;
  buildInfo: GatewayBuildInfo;
}

export const registerAgentRunsRoute = (
  app: FastifyInstance,
  config: GatewayConfig,
  deps: AgentRunsRouteDeps
): void => {
  app.post("/api/v2/agent/runs", async (request, reply) => {
    const totalStartedAt = Date.now();
    const traceId = buildTraceId(request.id);
    let eventMode: CompileMode | undefined;
    const {
      deferCompileOperatorAlert,
      sendCompileOperatorAlert,
      writeCompileEvent
    } = createCompileRouteAlerting({
      alertWebhookUrl: config.alertWebhookUrl,
      buildInfo: deps.buildInfo,
      compileEventSink: deps.compileEventSink,
      getMode: () => eventMode,
      method: request.method,
      path: request.url,
      reply,
      requestId: request.id,
      traceId
    });
    const writeCompileEventBestEffort = async (
      ...args: Parameters<typeof writeCompileEvent>
    ): Promise<void> => {
      try {
        await writeCompileEvent(...args);
      } catch {}
    };
    const rateKey = `${request.ip}:agent_runs`;
    const limit = await consumeRateLimit(
      rateKey,
      config.rateLimitMax,
      config.rateLimitWindowMs,
      deps.rateLimitStore
    );

    reply.header("x-ratelimit-limit", String(limit.limit));
    reply.header("x-ratelimit-remaining", String(limit.remaining));
    reply.header("x-ratelimit-reset", String(Math.floor(limit.resetAt / 1000)));
    if (!limit.allowed) {
      recordCompileRateLimited(deps.metricsStore);
      return reply.status(429).send({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests"
        }
      });
    }

    const parsed = AgentRunBodySchema.safeParse(request.body);
    if (!parsed.success) {
      await writeCompileEventBestEffort(
        "compile_validation_failure",
        "validation_failure",
        400,
        {
        detail: "invalid_request"
        }
      );
      return reply.status(400).send({
        error: {
          code: "INVALID_REQUEST",
          message: "Request payload is invalid"
        }
      });
    }

    const mode = parsed.data.mode as CompileMode;
    eventMode = mode;
    const attachmentMetadata = summarizeCompileAttachments(parsed.data.attachments);
    const attachmentsPresent = (parsed.data.attachments?.length ?? 0) > 0;
    if (attachmentsPresent && !config.attachmentsEnabled) {
      await writeCompileEventBestEffort(
        "compile_validation_failure",
        "validation_failure",
        400,
        {
          detail: "attachments_unsupported",
          metadata: attachmentMetadata
        }
      );
      return reply.status(400).send({
        error: {
          code: "ATTACHMENTS_UNSUPPORTED",
          message: "Gateway runtime does not support attachments yet"
        }
      });
    }

    if (parsed.data.mode === "official") {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return reply.status(401).send({
          error: {
            code: "MISSING_AUTH_HEADER",
            message: "Authorization bearer token required"
          }
        });
      }

      const sessionToken = authHeader.slice("Bearer ".length);
      const payload = await verifySessionToken(
        sessionToken,
        config,
        deps.sessionStore
      );
      if (!payload) {
        return reply.status(401).send({
          error: {
            code: "SESSION_EXPIRED",
            message: "Session token is invalid or expired"
          }
        });
      }
    }

    const byokEndpoint = request.headers["x-byok-endpoint"];
    const byokKey = request.headers["x-byok-key"];
    const compileInput = {
      message: parsed.data.message,
      mode,
      model: parsed.data.model,
      byokEndpoint:
        typeof byokEndpoint === "string" ? byokEndpoint : undefined,
      byokKey: typeof byokKey === "string" ? byokKey : undefined,
      attachments: parsed.data.attachments,
      context: normalizeCompileContext(parsed.data.context)
    };
    const alertUpstream = buildCompileAlertUpstream(config, compileInput);

    let upstreamCallCount = 0;
    const countedRequester: RequestCommandBatch = async (input) => {
      upstreamCallCount += 1;
      return deps.requestCommandBatch(input);
    };

    const repairInput = parsed.data.repair;
    const repairAuthor = createGeometryBrowserRepair(countedRequester);
    const workflow = createAgentWorkflow({
      author: repairInput
        ? (input) =>
            repairAuthor({
              sourceRun: repairInput.sourceRun,
              teacherInstruction: repairInput.teacherInstruction,
              canvasEvidence: repairInput.canvasEvidence,
              compileInput: input
            })
        : createGeometryAuthor(countedRequester),
      reviewer: createGeometryReviewer(countedRequester),
      reviser: createGeometryReviser(countedRequester),
      preflight: createGeometryPreflight(),
      getUpstreamCallCount: () => upstreamCallCount,
      buildRunId: () => `run_${request.id}`
    });

    try {
      const agentRun = await deps.compileGuard.run(() => workflow(compileInput));
      const totalMs = Math.max(0, Date.now() - totalStartedAt);
      const legacyAgentSteps = toLegacyAgentSteps(agentRun.telemetry.stages);
      const hadFallback = legacyAgentSteps.some(
        (step) => step.status === "fallback"
      );
      recordAgentRunQualitySample(
        {
          status:
            agentRun.run.status === "success" ||
            agentRun.run.status === "needs_review" ||
            agentRun.run.status === "degraded"
              ? agentRun.run.status
              : "failed",
          iterationCount: agentRun.run.iterationCount
        },
        deps.metricsStore
      );
      const repaired = legacyAgentSteps.some(
        (step) => step.name === "repair" && step.status === "ok"
      );
      const estimatedCostUsd =
        Math.max(0, config.costPerRequestUsd) *
        Math.max(1, agentRun.telemetry.upstreamCallCount);
      const finalStatus = repaired
        ? "repair"
        : toCompileFinalStatusFromAgentRun(agentRun.run.status);
      const successMetadata = mergeCompileMetadata(attachmentMetadata, {
        iterationCount: agentRun.run.iterationCount,
        reviewerVerdict: agentRun.reviews.at(-1)?.verdict ?? null,
        degraded: agentRun.telemetry.degraded
      });
      if (agentRun.evidence.preflight.status === "failed") {
        recordCompileFailure(totalMs, 0, deps.metricsStore);
        await writeCompileEventBestEffort(
          "compile_validation_failure",
          "validation_failure",
          200,
          {
            detail: "invalid_command_batch",
            upstreamCallCount: agentRun.telemetry.upstreamCallCount,
            metadata: mergeCompileMetadata(successMetadata, {
              issues: agentRun.evidence.preflight.issues
            })
          }
        );
        return reply.send({
          trace_id: traceId,
          agent_run: agentRun,
          metadata: attachmentMetadata
        });
      }
      await writeCompileEventBestEffort("compile_success", finalStatus, 200, {
        upstreamCallCount: agentRun.telemetry.upstreamCallCount,
        metadata: successMetadata
      });
      recordCompileSuccess(
        {
          retryCount: agentRun.telemetry.retryCount,
          latencyMs: totalMs,
          hadFallback,
          costUsd: estimatedCostUsd
        },
        deps.metricsStore
      );

      if (repaired) {
        const repairMetadata = mergeCompileMetadata(successMetadata, {
          repair: true
        });
        await writeCompileEventBestEffort("compile_repair", "repair", 200, {
          detail: "repair agent produced a valid batch",
          upstreamCallCount: agentRun.telemetry.upstreamCallCount,
          metadata: repairMetadata
        });
        await sendCompileOperatorAlert("compile_repair", "repair", 200, {
          detail: "repair agent produced a valid batch",
          metadata: repairMetadata,
          upstream: alertUpstream
        });
      }

      return reply.send({
        trace_id: traceId,
        agent_run: agentRun,
        metadata: attachmentMetadata
      });
    } catch (error) {
      const totalMs = Math.max(0, Date.now() - totalStartedAt);
      if (error instanceof CompileGuardBusyError) {
        recordCompileFailure(totalMs, 0, deps.metricsStore);
        await writeCompileEventBestEffort(
          "compile_runtime_rejected",
          "runtime_rejected",
          503,
          {
            detail: "max_in_flight_reached",
            metadata: mergeCompileMetadata(attachmentMetadata, {
              max_in_flight: config.compileMaxInFlight
            })
          }
        );
        deferCompileOperatorAlert("compile_runtime_rejected", "runtime_rejected", 503, {
          detail: "max_in_flight_reached",
          metadata: mergeCompileMetadata(attachmentMetadata, {
            max_in_flight: config.compileMaxInFlight
          }),
          upstream: alertUpstream
        });
        return reply.status(503).send({
          error: {
            code: error.code,
            message: error.message
          }
        });
      }

      if (error instanceof CompileGuardTimeoutError) {
        recordCompileFailure(totalMs, 0, deps.metricsStore);
        await writeCompileEventBestEffort("compile_timeout", "timeout", 504, {
          detail: "compile_timeout",
          metadata: mergeCompileMetadata(attachmentMetadata, {
            timeout_ms: config.compileTimeoutMs
          })
        });
        deferCompileOperatorAlert("compile_timeout", "timeout", 504, {
          detail: "compile_timeout",
          metadata: mergeCompileMetadata(attachmentMetadata, {
            timeout_ms: config.compileTimeoutMs
          }),
          upstream: alertUpstream
        });
        return reply.status(504).send({
          error: {
            code: error.code,
            message: error.message
          }
        });
      }

      recordCompileFailure(totalMs, 0, deps.metricsStore);
      const upstreamFailureDetail =
        error instanceof Error ? error.message : "upstream_failure";
      await writeCompileEventBestEffort(
        "compile_upstream_failure",
        "upstream_failure",
        502,
        {
          detail: upstreamFailureDetail,
          metadata: attachmentMetadata
        }
      );
      deferCompileOperatorAlert("compile_upstream_failure", "upstream_failure", 502, {
        detail: upstreamFailureDetail,
        upstream: alertUpstream
      });

      return reply.status(502).send({
        error: {
          code: "AGENT_WORKFLOW_FAILED",
          message: error instanceof Error ? error.message : "Agent workflow failed"
        }
      });
    }
  });
};
