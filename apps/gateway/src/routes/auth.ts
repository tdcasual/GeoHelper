import { FastifyInstance } from "fastify";
import { z } from "zod";

import { GatewayConfig } from "../config";
import { issueSessionToken } from "../services/session";
import { validatePresetToken } from "../services/token-auth";

const AuthBodySchema = z.object({
  token: z.string().min(1),
  device_id: z.string().min(1)
});

export const registerAuthRoutes = (
  app: FastifyInstance,
  config: GatewayConfig
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
};
