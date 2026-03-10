import { FastifyInstance } from "fastify";
import { z } from "zod";

import { GatewayConfig } from "../config";
import {
  CompileContext,
  CompileMode,
  RequestCommandBatch
} from "../services/litellm-client";
import {
  compileWithMultiAgent,
  compileWithSingleAgent
} from "../services/multi-agent";
import { verifySessionToken } from "../services/session";
import { GatewayMetricsStore } from "../services/metrics-store";
import { RateLimitStore } from "../services/rate-limit-store";
import { SessionRevocationStore } from "../services/session-store";
import { InvalidCommandBatchError } from "../services/verify-command-batch";
import { consumeRateLimit } from "../services/rate-limit";
import {
  recordCompilePerfSample,
  recordCompileFailure,
  recordCompileRateLimited,
  recordCompileSuccess
} from "../services/metrics";
import { sendAlert } from "../services/alerting";

const CompileBodySchema = z.object({
  message: z.string().min(1),
  mode: z.enum(["byok", "official"]),
  model: z.string().optional(),
  attachments: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: z.literal("image"),
        name: z.string().min(1),
        mimeType: z.string().min(1),
        size: z.number().int().nonnegative(),
        transportPayload: z.string().min(1)
      })
    )
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

export interface CompileRouteDeps {
  requestCommandBatch: RequestCommandBatch;
  sessionStore: SessionRevocationStore;
  rateLimitStore: RateLimitStore;
  metricsStore: GatewayMetricsStore;
}

export const registerCompileRoute = (
  app: FastifyInstance,
  config: GatewayConfig,
  deps: CompileRouteDeps
): void => {
  const normalizeContext = (
    raw: z.infer<typeof CompileBodySchema>["context"]
  ): CompileContext | undefined => {
    if (!raw) {
      return undefined;
    }

    const recentMessages = raw.recentMessages ?? raw.recent_messages;
    const sceneTransactions =
      raw.sceneTransactions ??
      raw.scene_transactions?.map((item) => ({
        sceneId: item.scene_id,
        transactionId: item.transaction_id,
        commandCount: item.command_count
      }));

    if (!recentMessages?.length && !sceneTransactions?.length) {
      return undefined;
    }

    return {
      recentMessages,
      sceneTransactions
    };
  };

  app.post("/api/v1/chat/compile", async (request, reply) => {
    const totalStartedAt = Date.now();
    const rateKey = `${request.ip}:compile`;
    const limit = consumeRateLimit(
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
      return reply.status(400).send({
        error: {
          code: "INVALID_REQUEST",
          message: "Request payload is invalid"
        }
      });
    }

    const mode = parsed.data.mode as CompileMode;

    if ((parsed.data.attachments?.length ?? 0) > 0) {
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
    const fallbackSingleAgent = request.headers["x-client-fallback-single-agent"];
    const performanceSampling = request.headers["x-client-performance-sampling"];
    const strictValidation = request.headers["x-client-strict-validation"];
    const useSingleAgent = fallbackSingleAgent === "1";
    const samplePerf = performanceSampling === "1";
    const strictMode = strictValidation === "1";

    try {
      const compileInput = {
        message: parsed.data.message,
        mode,
        model: parsed.data.model,
        byokEndpoint:
          typeof byokEndpoint === "string" ? byokEndpoint : undefined,
        byokKey: typeof byokKey === "string" ? byokKey : undefined,
        context: normalizeContext(parsed.data.context)
      };
      const result = useSingleAgent
        ? await compileWithSingleAgent(compileInput, deps.requestCommandBatch)
        : await compileWithMultiAgent(compileInput, deps.requestCommandBatch);
      const totalMs = Date.now() - totalStartedAt;

      const retryCount = result.agent_steps.some(
        (step) => step.name === "repair" && step.status === "ok"
      )
        ? 1
        : 0;
      const hadFallback = result.agent_steps.some(
        (step) => step.status === "fallback"
      );
      const fallbackSteps = result.agent_steps.filter(
        (step) => step.status === "fallback"
      );
      const repaired = result.agent_steps.some(
        (step) => step.name === "repair" && step.status === "ok"
      );
      const estimatedCostUsd =
        Math.max(0, config.costPerRequestUsd) *
        Math.max(1, result.upstream_calls);
      recordCompileSuccess(
        {
          retryCount,
          latencyMs: totalMs,
          hadFallback,
          costUsd: estimatedCostUsd
        },
        deps.metricsStore
      );
      if (samplePerf) {
        recordCompilePerfSample({
          totalMs,
          upstreamMs: result.upstream_ms
        }, deps.metricsStore);
        reply.header("x-perf-total-ms", String(totalMs));
        reply.header("x-perf-upstream-ms", String(result.upstream_ms));
      }

      if (fallbackSteps.length > 0) {
        await sendAlert(config.alertWebhookUrl, {
          traceId: request.id,
          path: request.url,
          method: request.method,
          statusCode: 200,
          event: "compile_fallback",
          detail: fallbackSteps.map((step) => step.name).join(","),
          metadata: {
            fallback_steps: fallbackSteps.map((step) => step.name)
          }
        });
      } else if (repaired) {
        await sendAlert(config.alertWebhookUrl, {
          traceId: request.id,
          path: request.url,
          method: request.method,
          statusCode: 200,
          event: "compile_repair",
          detail: "repair agent produced a valid batch",
          metadata: {
            repair: true
          }
        });
      }

      return reply.send({
        trace_id: `tr_${Date.now()}`,
        batch: result.batch,
        agent_steps: result.agent_steps
      });
    } catch (error) {
      const totalMs = Date.now() - totalStartedAt;
      if (error instanceof InvalidCommandBatchError) {
        recordCompileFailure(totalMs, 0, deps.metricsStore);
        return reply.status(422).send({
          error: {
            code: "INVALID_COMMAND_BATCH",
            message: strictMode
              ? "Command batch validation failed (strict)"
              : "Command batch validation failed",
            details: error.issues
          }
        });
      }

      recordCompileFailure(totalMs, 0, deps.metricsStore);
      return reply.status(502).send({
        error: {
          code: "LITELLM_UPSTREAM_ERROR",
          message: "Failed to compile with upstream model"
        }
      });
    }
  });
};
