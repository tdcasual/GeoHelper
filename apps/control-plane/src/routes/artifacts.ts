import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ControlPlaneServices } from "../control-plane-context";

export const registerArtifactsRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.get("/api/v3/artifacts/:artifactId", async (request, reply) => {
    const params = z
      .object({
        artifactId: z.string().min(1)
      })
      .parse(request.params);
    const artifact = await services.store.artifacts.getArtifact(params.artifactId);

    if (!artifact) {
      return reply.code(404).send({
        error: "artifact_not_found"
      });
    }

    return reply.send({
      artifact
    });
  });
};
