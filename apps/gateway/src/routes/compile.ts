import { RuntimeAttachmentSchema } from "@geohelper/protocol";
import { FastifyInstance } from "fastify";
import { z } from "zod";

import { GatewayConfig } from "../config";
import { GatewayBuildInfo } from "../services/build-info";
import {
  buildTraceId,
  CompileEventSink,
  CompileFinalStatus
} from "../services/compile-events";
import {
  CompileGuard,
  CompileGuardBusyError,
  CompileGuardTimeoutError
} from "../services/compile-guard";
import { createAgentWorkflow } from "../services/agent-workflow";
import { createGeometryAuthor } from "../services/geometry-author";
import { createGeometryPreflight } from "../services/geometry-preflight";
import { createGeometryReviewer } from "../services/geometry-reviewer";
import { createGeometryReviser } from "../services/geometry-reviser";
import {
  CompileMode,
  RequestCommandBatch
} from "../services/litellm-client";
import {
  recordAgentRunQualitySample,
  recordCompileFailure,
  recordCompilePerfSample,
  recordCompileRateLimited,
  recordCompileSuccess
} from "../services/metrics";
import { GatewayMetricsStore } from "../services/metrics-store";
import { consumeRateLimit } from "../services/rate-limit";
import { RateLimitStore } from "../services/rate-limit-store";
import { verifySessionToken } from "../services/session";
import { SessionRevocationStore } from "../services/session-store";
import {
  buildCompileAlertUpstream,
  LegacyAgentStep,
  toLegacyAgentSteps
} from "./compile-route-agent-adapter";
import { createCompileRouteAlerting } from "./compile-route-alerts";
import {
  mergeCompileMetadata,
  normalizeCompileContext,
  summarizeCompileAttachments,
  toCompileFinalStatusFromAgentRun
} from "./compile-route-helpers";

const CompileBodySchema = z.object({
  message: z.string().min(1),
  mode: z.enum(["byok", "official"]),
  model: z.string().optional(),
  attachments: z.array(RuntimeAttachmentSchema).optional(),
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

export interface CompileRouteDeps {
  requestCommandBatch: RequestCommandBatch;
  sessionStore: SessionRevocationStore;
  rateLimitStore: RateLimitStore;
  metricsStore: GatewayMetricsStore;
  compileEventSink: CompileEventSink;
  compileGuard: CompileGuard;
  buildInfo: GatewayBuildInfo;
}

export const registerCompileRoute = (
  app: FastifyInstance,
  config: GatewayConfig,
  deps: CompileRouteDeps
): void => {
  app.post("/api/v1/chat/compile", async (request, reply) => {
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

    const rateKey = `${request.ip}:compile`;
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

    const parsed = CompileBodySchema.safeParse(request.body);
    if (!parsed.success) {
      await writeCompileEvent("compile_validation_failure", "validation_failure", 400, {
        detail: "invalid_request"
      });
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
      await writeCompileEvent("compile_validation_failure", "validation_failure", 400, {
        detail: "attachments_unsupported",
        metadata: attachmentMetadata
      });
      return reply.status(400).send({
        error: {
          code: "ATTACHMENTS_UNSUPPORTED",
          message: "Gateway runtime does not support attachments yet"
        }
      });
    }

    if (mode === "official") {
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
    const performanceSampling = request.headers["x-client-performance-sampling"];
    const strictValidation = request.headers["x-client-strict-validation"];
    const samplePerf = performanceSampling === "1";
    const strictMode = strictValidation === "1";

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
    let upstreamMs = 0;
    const countedRequester: RequestCommandBatch = async (input) => {
      upstreamCallCount += 1;
      const startedAt = Date.now();
      try {
        return await deps.requestCommandBatch(input);
      } finally {
        upstreamMs += Date.now() - startedAt;
      }
    };

    const workflow = createAgentWorkflow({
      author: createGeometryAuthor(countedRequester),
      reviewer: createGeometryReviewer(countedRequester),
      reviser: createGeometryReviser(countedRequester),
      preflight: createGeometryPreflight(),
      getUpstreamCallCount: () => upstreamCallCount,
      buildRunId: () => `compile_${request.id}`
    });

    try {
      const agentRun = await deps.compileGuard.run(() => workflow(compileInput));
      const totalMs = Date.now() - totalStartedAt;
      const legacyAgentSteps = toLegacyAgentSteps(agentRun.telemetry.stages);
      const retryCount = Math.max(0, agentRun.run.iterationCount - 1);
      const hadFallback = legacyAgentSteps.some(
        (step) => step.status === "fallback"
      );
      const repaired = legacyAgentSteps.some(
        (step) => step.name === "repair" && step.status === "ok"
      );
      const estimatedCostUsd =
        Math.max(0, config.costPerRequestUsd) *
        Math.max(1, agentRun.telemetry.upstreamCallCount);
      const successMetadata = mergeCompileMetadata(attachmentMetadata, {
        iterationCount: agentRun.run.iterationCount,
        reviewerVerdict: agentRun.reviews.at(-1)?.verdict ?? null,
        degraded: agentRun.telemetry.degraded
      });

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

      if (agentRun.evidence.preflight.status === "failed") {
        recordCompileFailure(totalMs, 0, deps.metricsStore);
        await writeCompileEvent("compile_validation_failure", "validation_failure", 422, {
          detail: "invalid_command_batch",
          upstreamCallCount: agentRun.telemetry.upstreamCallCount,
          metadata: mergeCompileMetadata(successMetadata, {
            issues: agentRun.evidence.preflight.issues
          })
        });
        return reply.status(422).send({
          error: {
            code: "INVALID_COMMAND_BATCH",
            message: strictMode
              ? "Command batch validation failed (strict)"
              : "Command batch validation failed",
            details: agentRun.evidence.preflight.issues
          }
        });
      }

      const finalStatus: CompileFinalStatus = hadFallback
        ? "fallback"
        : repaired
          ? "repair"
          : toCompileFinalStatusFromAgentRun(agentRun.run.status);

      recordCompileSuccess(
        {
          retryCount,
          latencyMs: totalMs,
          hadFallback,
          costUsd: estimatedCostUsd
        },
        deps.metricsStore
      );
      await writeCompileEvent("compile_success", finalStatus, 200, {
        upstreamCallCount: agentRun.telemetry.upstreamCallCount,
        metadata: successMetadata
      });

      if (samplePerf) {
        recordCompilePerfSample(
          {
            totalMs,
            upstreamMs
          },
          deps.metricsStore
        );
        reply.header("x-perf-total-ms", String(totalMs));
        reply.header("x-perf-upstream-ms", String(upstreamMs));
      }

      if (hadFallback) {
        const fallbackSteps = legacyAgentSteps
          .filter((step) => step.status === "fallback")
          .map((step) => step.name);
        await writeCompileEvent("compile_fallback", "fallback", 200, {
          detail: fallbackSteps.join(","),
          upstreamCallCount: agentRun.telemetry.upstreamCallCount,
          metadata: mergeCompileMetadata(successMetadata, {
            fallback_steps: fallbackSteps
          })
        });
        await sendCompileOperatorAlert("compile_fallback", "fallback", 200, {
          detail: fallbackSteps.join(","),
          metadata: mergeCompileMetadata(successMetadata, {
            fallback_steps: fallbackSteps
          }),
          upstream: alertUpstream
        });
      } else if (repaired) {
        await writeCompileEvent("compile_repair", "repair", 200, {
          detail: "repair agent produced a valid batch",
          upstreamCallCount: agentRun.telemetry.upstreamCallCount,
          metadata: mergeCompileMetadata(successMetadata, {
            repair: true
          })
        });
        await sendCompileOperatorAlert("compile_repair", "repair", 200, {
          detail: "repair agent produced a valid batch",
          metadata: mergeCompileMetadata(successMetadata, {
            repair: true
          }),
          upstream: alertUpstream
        });
      }

      return reply.send({
        trace_id: traceId,
        batch: agentRun.draft.commandBatchDraft,
        agent_steps: legacyAgentSteps
      });
    } catch (error) {
      const totalMs = Date.now() - totalStartedAt;
      if (error instanceof CompileGuardBusyError) {
        recordCompileFailure(totalMs, 0, deps.metricsStore);
        await writeCompileEvent("compile_runtime_rejected", "runtime_rejected", 503, {
          detail: "max_in_flight_reached",
          metadata: mergeCompileMetadata(attachmentMetadata, {
            max_in_flight: config.compileMaxInFlight
          })
        });
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
        await writeCompileEvent("compile_timeout", "timeout", 504, {
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
      await writeCompileEvent("compile_upstream_failure", "upstream_failure", 502, {
        detail: error instanceof Error ? error.message : "upstream_failure",
        metadata: attachmentMetadata
      });
      deferCompileOperatorAlert("compile_upstream_failure", "upstream_failure", 502, {
        detail: error instanceof Error ? error.message : "upstream_failure",
        upstream: alertUpstream
      });
      return reply.status(502).send({
        error: {
          code: "LITELLM_UPSTREAM_ERROR",
          message: "Failed to compile with upstream model"
        }
      });
    }
  });
};
