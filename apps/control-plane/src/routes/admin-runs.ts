import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ControlPlaneServices } from "../control-plane-context";

const RunsQuerySchema = z.object({
  status: z.string().min(1).optional(),
  parentRunId: z.string().min(1).optional()
});

export const registerAdminRunsRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.get("/admin/runs", async (request) => {
    const query = RunsQuerySchema.parse(request.query);
    const runs = await services.store.runs.listRuns({
      status: query.status as never,
      parentRunId: query.parentRunId
    });

    return {
      runs
    };
  });

  app.get("/admin/runs/:runId/timeline", async (request, reply) => {
    const params = z
      .object({
        runId: z.string().min(1)
      })
      .parse(request.params);
    const snapshot = await services.store.loadRunSnapshot(params.runId);

    if (!snapshot) {
      return reply.code(404).send({
        error: "run_not_found"
      });
    }

    const [childRuns, delegationSessions] = await Promise.all([
      services.store.runs.listRuns({
        parentRunId: params.runId
      }),
      services.store.delegationSessions.listSessions({
        runId: params.runId
      })
    ]);
    const artifactRuns = [snapshot.run, ...childRuns];
    const artifacts = (
      await Promise.all(
        artifactRuns.map((run) => services.store.artifacts.listRunArtifacts(run.id))
      )
    )
      .flat()
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const summary = {
      eventCount: snapshot.events.length,
      checkpointCount: snapshot.checkpoints.length,
      pendingCheckpointCount: snapshot.checkpoints.filter(
        (checkpoint) => checkpoint.status === "pending"
      ).length,
      delegationSessionCount: delegationSessions.length,
      pendingDelegationCount: delegationSessions.filter(
        (session) => session.status === "pending"
      ).length,
      artifactCount: artifacts.length,
      memoryWriteCount: snapshot.memoryEntries.length,
      childRunCount: childRuns.length
    };

    return {
      run: snapshot.run,
      events: snapshot.events,
      childRuns,
      checkpoints: snapshot.checkpoints,
      delegationSessions,
      artifacts,
      summary,
      memoryEntries: snapshot.memoryEntries
    };
  });
};
