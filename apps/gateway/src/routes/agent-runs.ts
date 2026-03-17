import {
  AgentRunEnvelopeSchema,
  GeometryCanvasEvidenceSchema,
  RuntimeAttachmentSchema
} from "@geohelper/protocol";
import { FastifyInstance } from "fastify";
import { z } from "zod";

import { GatewayConfig } from "../config";
import {
  buildTraceId,
  type CompileEventSink
} from "../services/compile-events";
import {
  CompileGuard,
  CompileGuardBusyError,
  CompileGuardTimeoutError
} from "../services/compile-guard";
import { createAgentWorkflow } from "../services/agent-workflow";
import { createGeometryAuthor } from "../services/geometry-author";
import { createGeometryBrowserRepair } from "../services/geometry-browser-repair";
import { createGeometryPreflight } from "../services/geometry-preflight";
import { createGeometryReviewer } from "../services/geometry-reviewer";
import { createGeometryReviser } from "../services/geometry-reviser";
import { type RequestCommandBatch } from "../services/litellm-client";
import { recordAgentRunQualitySample } from "../services/metrics";
import { type GatewayMetricsStore } from "../services/metrics-store";
import { consumeRateLimit } from "../services/rate-limit";
import { type RateLimitStore } from "../services/rate-limit-store";
import { verifySessionToken } from "../services/session";
import { type SessionRevocationStore } from "../services/session-store";
import {
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
}

export const registerAgentRunsRoute = (
  app: FastifyInstance,
  config: GatewayConfig,
  deps: AgentRunsRouteDeps
): void => {
  app.post("/api/v2/agent/runs", async (request, reply) => {
    const traceId = buildTraceId(request.id);
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
      return reply.status(429).send({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests"
        }
      });
    }

    const parsed = AgentRunBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: "INVALID_REQUEST",
          message: "Request payload is invalid"
        }
      });
    }

    const attachmentsPresent = (parsed.data.attachments?.length ?? 0) > 0;
    if (attachmentsPresent && !config.attachmentsEnabled) {
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
      mode: parsed.data.mode,
      model: parsed.data.model,
      byokEndpoint:
        typeof byokEndpoint === "string" ? byokEndpoint : undefined,
      byokKey: typeof byokKey === "string" ? byokKey : undefined,
      attachments: parsed.data.attachments,
      context: normalizeCompileContext(parsed.data.context)
    };

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
      await deps.compileEventSink.write({
        event: "compile_success",
        finalStatus: toCompileFinalStatusFromAgentRun(agentRun.run.status),
        traceId,
        requestId: request.id,
        path: request.url,
        method: request.method,
        mode: parsed.data.mode,
        statusCode: 200,
        upstreamCallCount: agentRun.telemetry.upstreamCallCount,
        metadata: {
          ...summarizeCompileAttachments(parsed.data.attachments),
          iterationCount: agentRun.run.iterationCount,
          reviewerVerdict: agentRun.reviews.at(-1)?.verdict ?? null,
          degraded: agentRun.telemetry.degraded
        }
      });

      return reply.send({
        trace_id: traceId,
        agent_run: agentRun,
        metadata: summarizeCompileAttachments(parsed.data.attachments)
      });
    } catch (error) {
      if (error instanceof CompileGuardBusyError) {
        return reply.status(503).send({
          error: {
            code: error.code,
            message: error.message
          }
        });
      }

      if (error instanceof CompileGuardTimeoutError) {
        return reply.status(504).send({
          error: {
            code: error.code,
            message: error.message
          }
        });
      }

      return reply.status(502).send({
        error: {
          code: "AGENT_WORKFLOW_FAILED",
          message: error instanceof Error ? error.message : "Agent workflow failed"
        }
      });
    }
  });
};
