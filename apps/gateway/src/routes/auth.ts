import { FastifyInstance } from "fastify";
import { z } from "zod";

import { GatewayConfig } from "../config";
import {
  issueSessionToken,
  revokeSessionToken,
  verifySessionToken
} from "../services/session";
import { SessionRevocationStore } from "../services/session-store";
import { validatePresetToken } from "../services/token-auth";

const AuthBodySchema = z.object({
  token: z.string().min(1),
  device_id: z.string().min(1)
});

interface AuthRouteDeps {
  sessionStore: SessionRevocationStore;
}

export const registerAuthRoutes = (
  app: FastifyInstance,
  config: GatewayConfig,
  deps: AuthRouteDeps
): void => {
  app.post("/api/v1/auth/token/login", async (request, reply) => {
    const parseResult = AuthBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "INVALID_REQUEST",
          message: "Request payload is invalid"
        }
      });
    }

    const { token, device_id: deviceId } = parseResult.data;

    if (!validatePresetToken(token, config)) {
      return reply.status(401).send({
        error: {
          code: "INVALID_PRESET_TOKEN",
          message: "Token is invalid"
        }
      });
    }

    const sessionToken = issueSessionToken(deviceId, config);
    return reply.send({
      session_token: sessionToken,
      expires_in: config.sessionTtlSeconds,
      token_type: "Bearer"
    });
  });

  app.post("/api/v1/auth/token/revoke", async (request, reply) => {
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
    const payload = verifySessionToken(sessionToken, config, deps.sessionStore);
    if (!payload) {
      return reply.status(401).send({
        error: {
          code: "SESSION_EXPIRED",
          message: "Session token is invalid or expired"
        }
      });
    }

    revokeSessionToken(sessionToken, deps.sessionStore);
    return reply.send({
      revoked: true
    });
  });
};
