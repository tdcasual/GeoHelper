import { CheckpointSchema } from "@geohelper/agent-protocol";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  type ControlPlaneServices,
  findCheckpointById} from "../control-plane-context";

const ResolveCheckpointBodySchema = z.object({
  response: z.unknown()
});

export const registerCheckpointsRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.post("/api/v3/checkpoints/:checkpointId/resolve", async (request, reply) => {
    const params = z
      .object({
        checkpointId: z.string().min(1)
      })
      .parse(request.params);
    const body = ResolveCheckpointBodySchema.parse(request.body);
    const checkpoint = await findCheckpointById(services, params.checkpointId);

    if (!checkpoint || checkpoint.status !== "pending") {
      return reply.code(404).send({
        error: "checkpoint_not_found"
      });
    }

    const resolvedCheckpoint = CheckpointSchema.parse({
      ...checkpoint,
      status: "resolved",
      response: body.response,
      resolvedAt: services.now()
    });

    await services.store.checkpoints.upsertCheckpoint(resolvedCheckpoint);
    await services.resumeRunFromCheckpoint({
      runId: checkpoint.runId,
      checkpointId: checkpoint.id,
      response: body.response
    });

    return reply.send({
      checkpoint: resolvedCheckpoint
    });
  });
};
