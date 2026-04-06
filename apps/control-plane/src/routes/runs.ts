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
const isTerminalRunStatus = (
  status: "completed" | "failed" | "cancelled" | "queued" | "planning" | "running" | "waiting_for_checkpoint" | "waiting_for_subagent" | "waiting_for_tool" | "evaluating"
): status is "completed" | "failed" | "cancelled" =>
  status === "completed" || status === "failed" || status === "cancelled";

export const registerRunsRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.get("/api/v3/runs/:runId", async (request, reply) => {
    const params = z
      .object({
        runId: z.string().min(1)
      })
      .parse(request.params);
    const run = await services.store.runs.getRun(params.runId);

    if (!run) {
      return reply.code(404).send({
        error: "run_not_found"
      });
    }

    return reply.send({
      run
    });
  });

  app.get("/api/v3/runs/:runId/events", async (request, reply) => {
    const params = z
      .object({
        runId: z.string().min(1)
      })
      .parse(request.params);
    const run = await services.store.runs.getRun(params.runId);

    if (!run) {
      return reply.code(404).send({
        error: "run_not_found"
      });
    }

    return reply.send({
      events: await services.store.events.listRunEvents(params.runId)
    });
  });

  app.post("/api/v3/runs/:runId/cancel", async (request, reply) => {
    const params = z
      .object({
        runId: z.string().min(1)
      })
      .parse(request.params);
    const run = await services.store.runs.getRun(params.runId);

    if (!run) {
      return reply.code(404).send({
        error: "run_not_found"
      });
    }
    if (isTerminalRunStatus(run.status)) {
      return reply.code(409).send({
        error: "run_not_cancellable",
        status: run.status
      });
    }

    const timestamp = services.now();
    const checkpoints = await services.store.checkpoints.listRunCheckpoints(run.id);
    const cancelledRun = {
      ...run,
      status: "cancelled" as const,
      updatedAt: timestamp
    };

    await services.store.runs.createRun(cancelledRun);
    await Promise.all(
      checkpoints
        .filter((checkpoint) => checkpoint.status === "pending")
        .map((checkpoint) =>
          services.store.checkpoints.upsertCheckpoint({
            ...checkpoint,
            status: "cancelled",
            resolvedAt: timestamp
          })
        )
    );
    await services.store.engineStates.deleteState(run.id);
    await appendRunEvent(services, run.id, "run.cancelled", {
      previousStatus: run.status
    });

    return reply.send({
      run: cancelledRun
    });
  });

  app.post("/api/v3/threads/:threadId/runs", async (request, reply) => {
    const params = z
      .object({
        threadId: z.string().min(1)
      })
      .parse(request.params);

    const thread = await services.store.threads.getThread(params.threadId);

    if (!thread) {
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
      profileId: runProfile.id,
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
    await services.processRun(run.id);

    return reply.code(202).send({
      run
    });
  });
};
