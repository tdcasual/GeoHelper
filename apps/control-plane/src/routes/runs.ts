import { RunSchema } from "@geohelper/agent-protocol";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  appendRunEvent,
  type ControlPlaneServices,
  DEFAULT_RUN_BUDGET} from "../control-plane-context";

const StartRunBodySchema = z.object({
  profileId: z.string().min(1),
  inputArtifactIds: z.array(z.string().min(1)).default([])
});

export const registerRunsRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.post("/api/v3/threads/:threadId/runs", async (request, reply) => {
    const params = z
      .object({
        threadId: z.string().min(1)
      })
      .parse(request.params);

    if (!services.threads.has(params.threadId)) {
      return reply.code(404).send({
        error: "thread_not_found"
      });
    }

    const body = StartRunBodySchema.parse(request.body);
    const runProfile = services.runProfiles.get(body.profileId);
    if (!runProfile) {
      return reply.code(400).send({
        error: "unknown_run_profile",
        profileId: body.profileId
      });
    }
    const timestamp = services.now();
    const run = RunSchema.parse({
      id: services.buildRunId(),
      threadId: params.threadId,
      workflowId: runProfile.workflowId,
      agentId: runProfile.agentId,
      status: "queued",
      inputArtifactIds: body.inputArtifactIds,
      outputArtifactIds: [],
      budget: runProfile.defaultBudget ?? DEFAULT_RUN_BUDGET,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    await services.store.runs.createRun(run);
    await appendRunEvent(services, run.id, "run.created", {
      status: run.status,
      threadId: run.threadId,
      profileId: runProfile.id
    });

    return reply.code(202).send({
      run
    });
  });
};
