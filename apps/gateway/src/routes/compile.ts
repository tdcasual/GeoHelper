import { FastifyInstance } from "fastify";
import { z } from "zod";

import { GatewayConfig } from "../config";
import {
  CompileMode,
  RequestCommandBatch
} from "../services/litellm-client";
import { compileWithMultiAgent } from "../services/multi-agent";
import { verifySessionToken } from "../services/session";
import { InvalidCommandBatchError } from "../services/verify-command-batch";
import { consumeRateLimit } from "../services/rate-limit";

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

    try {
      const result = await compileWithMultiAgent(
        {
          message: parsed.data.message,
          mode,
          model: parsed.data.model,
          byokEndpoint:
            typeof byokEndpoint === "string" ? byokEndpoint : undefined,
          byokKey: typeof byokKey === "string" ? byokKey : undefined
        },
        deps.requestCommandBatch
      );

      return reply.send({
        trace_id: `tr_${Date.now()}`,
        batch: result.batch,
        agent_steps: result.agent_steps
      });
    } catch (error) {
      if (error instanceof InvalidCommandBatchError) {
        return reply.status(422).send({
          error: {
            code: "INVALID_COMMAND_BATCH",
            message: "Command batch validation failed",
            details: error.issues
          }
        });
      }

      return reply.status(502).send({
        error: {
          code: "LITELLM_UPSTREAM_ERROR",
          message: "Failed to compile with upstream model"
        }
      });
      }
  });
};
