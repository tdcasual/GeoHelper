import { FastifyInstance } from "fastify";
import { z } from "zod";

import { GatewayConfig } from "../config";
import {
  CompileMode,
  RequestCommandBatch
} from "../services/litellm-client";
import {
  compileWithMultiAgent,
  compileWithSingleAgent
} from "../services/multi-agent";
import { verifySessionToken } from "../services/session";
import { InvalidCommandBatchError } from "../services/verify-command-batch";
import { consumeRateLimit } from "../services/rate-limit";
import {
  recordCompilePerfSample,
  recordCompileFailure,
  recordCompileRateLimited,
  recordCompileSuccess
} from "../services/metrics";

const CompileBodySchema = z.object({
  message: z.string().min(1),
  mode: z.enum(["byok", "official"]),
  model: z.string().optional()
});

export interface CompileRouteDeps {
  requestCommandBatch: RequestCommandBatch;
}

export const registerCompileRoute = (
  app: FastifyInstance,
  config: GatewayConfig,
  deps: CompileRouteDeps
): void => {
  app.post("/api/v1/chat/compile", async (request, reply) => {
    const totalStartedAt = Date.now();
    const rateKey = `${request.ip}:compile`;
    const limit = consumeRateLimit(
      rateKey,
      config.rateLimitMax,
      config.rateLimitWindowMs
    );
    reply.header("x-ratelimit-limit", String(limit.limit));
    reply.header("x-ratelimit-remaining", String(limit.remaining));
    reply.header("x-ratelimit-reset", String(Math.floor(limit.resetAt / 1000)));
    if (!limit.allowed) {
      recordCompileRateLimited();
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
      const payload = verifySessionToken(sessionToken, config);
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
        byokKey: typeof byokKey === "string" ? byokKey : undefined
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
      recordCompileSuccess({
        retryCount,
        latencyMs: totalMs,
        hadFallback
      });
      if (samplePerf) {
        recordCompilePerfSample({
          totalMs,
          upstreamMs: result.upstream_ms
        });
        reply.header("x-perf-total-ms", String(totalMs));
        reply.header("x-perf-upstream-ms", String(result.upstream_ms));
      }

      return reply.send({
        trace_id: `tr_${Date.now()}`,
        batch: result.batch,
        agent_steps: result.agent_steps
      });
    } catch (error) {
      const totalMs = Date.now() - totalStartedAt;
      if (error instanceof InvalidCommandBatchError) {
        recordCompileFailure(totalMs);
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

      recordCompileFailure(totalMs);
      return reply.status(502).send({
        error: {
          code: "LITELLM_UPSTREAM_ERROR",
          message: "Failed to compile with upstream model"
        }
      });
    }
  });
};
