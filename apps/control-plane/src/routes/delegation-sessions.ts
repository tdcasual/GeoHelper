import {
  ArtifactKindSchema,
  CheckpointSchema,
  type Run
} from "@geohelper/agent-protocol";
import type { DelegationSessionRecord } from "@geohelper/agent-store";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  appendRunEvent,
  type ControlPlaneServices
} from "../control-plane-context";

const ListDelegationSessionsQuerySchema = z.object({
  runId: z.string().min(1).optional(),
  status: z.enum(["pending", "completed", "failed", "cancelled"]).optional(),
  agentRef: z.string().min(1).optional(),
  serviceRef: z.string().min(1).optional(),
  claimedBy: z.string().min(1).optional()
});

const ClaimDelegationSessionBodySchema = z.object({
  executorId: z.string().min(1),
  agentRef: z.string().min(1).optional(),
  serviceRef: z.string().min(1).optional(),
  ttlSeconds: z.number().int().positive().max(3600).optional()
});

const UpdateDelegationSessionClaimBodySchema = z.object({
  executorId: z.string().min(1),
  ttlSeconds: z.number().int().positive().max(3600).optional()
});

const DelegationArtifactBodySchema = z.discriminatedUnion("storage", [
  z.object({
    kind: ArtifactKindSchema,
    contentType: z.string().min(1),
    storage: z.literal("inline"),
    inlineData: z.unknown(),
    metadata: z.record(z.string(), z.unknown()).default({})
  }),
  z.object({
    kind: ArtifactKindSchema,
    contentType: z.string().min(1),
    storage: z.literal("blob"),
    blobUri: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).default({})
  })
]);

const SubmitDelegationSessionResultBodySchema = z.object({
  executorId: z.string().min(1).optional(),
  status: z.enum(["completed", "failed"]),
  result: z.unknown().optional(),
  artifacts: z.array(DelegationArtifactBodySchema).default([])
});

const DEFAULT_CLAIM_TTL_SECONDS = 300;

const addSeconds = (timestamp: string, seconds: number): string =>
  new Date(Date.parse(timestamp) + seconds * 1000).toISOString();

const isClaimActive = (
  session: {
    claimedBy?: string;
    claimExpiresAt?: string;
  },
  now: string
): boolean =>
  Boolean(
    session.claimedBy &&
      session.claimExpiresAt &&
      session.claimExpiresAt > now
  );

const serializeDelegationSession = <
  T extends {
    claimedBy?: string;
    claimedAt?: string;
    claimExpiresAt?: string;
  }
>(
  session: T
) => ({
  ...session,
  claimedBy: session.claimedBy ?? null,
  claimedAt: session.claimedAt ?? null,
  claimExpiresAt: session.claimExpiresAt ?? null
});

const hydrateSession = async (
  services: ControlPlaneServices,
  session: DelegationSessionRecord
) =>
  serializeDelegationSession({
    ...session,
    run: await services.store.runs.getRun(session.runId),
    checkpoint: await services.store.checkpoints.getCheckpoint(session.checkpointId)
  });

const mergeArtifactIds = (
  existingArtifactIds: string[],
  nextArtifactIds: string[]
): string[] => [...new Set([...existingArtifactIds, ...nextArtifactIds])];

const buildDelegationArtifactId = (sessionId: string, index: number): string =>
  `artifact_${sessionId}_${index + 1}`;

const persistRun = async (
  services: ControlPlaneServices,
  run: Run
): Promise<void> => {
  await services.store.runs.createRun(run);
};

export const registerDelegationSessionsRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.get("/api/v3/delegation-sessions", async (request) => {
    const query = ListDelegationSessionsQuerySchema.parse(request.query);
    const sessions = await services.store.delegationSessions.listSessions(query);
    const hydrated = await Promise.all(sessions.map((session) => hydrateSession(services, session)));

    return {
      sessions: hydrated
    };
  });

  app.post("/api/v3/delegation-sessions/claim", async (request) => {
    const body = ClaimDelegationSessionBodySchema.parse(request.body);
    const now = services.now();
    const ttlSeconds = body.ttlSeconds ?? DEFAULT_CLAIM_TTL_SECONDS;
    const session = (
      await services.store.delegationSessions.listSessions({
        status: "pending",
        agentRef: body.agentRef,
        serviceRef: body.serviceRef
      })
    ).find((candidate) => !isClaimActive(candidate, now));

    if (!session) {
      return {
        claimed: false,
        session: null
      };
    }

    const claimedSession = {
      ...session,
      claimedBy: body.executorId,
      claimedAt: now,
      claimExpiresAt: addSeconds(now, ttlSeconds),
      updatedAt: now
    };

    await services.store.delegationSessions.upsertSession(claimedSession);

    return {
      claimed: true,
      session: await hydrateSession(services, claimedSession)
    };
  });

  app.get("/api/v3/delegation-sessions/:sessionId", async (request, reply) => {
    const params = z
      .object({
        sessionId: z.string().min(1)
      })
      .parse(request.params);
    const session = await services.store.delegationSessions.getSession(params.sessionId);

    if (!session) {
      return reply.code(404).send({
        error: "delegation_session_not_found"
      });
    }

    return {
      session: await hydrateSession(services, session)
    };
  });

  app.post("/api/v3/delegation-sessions/:sessionId/heartbeat", async (request, reply) => {
    const params = z
      .object({
        sessionId: z.string().min(1)
      })
      .parse(request.params);
    const body = UpdateDelegationSessionClaimBodySchema.parse(request.body);
    const session = await services.store.delegationSessions.getSession(params.sessionId);

    if (!session) {
      return reply.code(404).send({
        error: "delegation_session_not_found"
      });
    }

    if (session.status !== "pending" || session.claimedBy !== body.executorId) {
      return reply.code(409).send({
        error: "delegation_session_claim_not_owned"
      });
    }

    const now = services.now();
    const updatedSession = {
      ...session,
      claimExpiresAt: addSeconds(
        now,
        body.ttlSeconds ?? DEFAULT_CLAIM_TTL_SECONDS
      ),
      updatedAt: now
    };

    await services.store.delegationSessions.upsertSession(updatedSession);

    return {
      session: await hydrateSession(services, updatedSession)
    };
  });

  app.post("/api/v3/delegation-sessions/:sessionId/release", async (request, reply) => {
    const params = z
      .object({
        sessionId: z.string().min(1)
      })
      .parse(request.params);
    const body = UpdateDelegationSessionClaimBodySchema.parse(request.body);
    const session = await services.store.delegationSessions.getSession(params.sessionId);

    if (!session) {
      return reply.code(404).send({
        error: "delegation_session_not_found"
      });
    }

    if (session.status !== "pending" || session.claimedBy !== body.executorId) {
      return reply.code(409).send({
        error: "delegation_session_claim_not_owned"
      });
    }

    const updatedSession = {
      ...session,
      claimedBy: undefined,
      claimedAt: undefined,
      claimExpiresAt: undefined,
      updatedAt: services.now()
    };

    await services.store.delegationSessions.upsertSession(updatedSession);

    return {
      session: await hydrateSession(services, updatedSession)
    };
  });

  app.post("/admin/delegation-sessions/:sessionId/release", async (request, reply) => {
    const params = z
      .object({
        sessionId: z.string().min(1)
      })
      .parse(request.params);
    const session = await services.store.delegationSessions.getSession(params.sessionId);

    if (!session) {
      return reply.code(404).send({
        error: "delegation_session_not_found"
      });
    }

    if (session.status !== "pending") {
      return reply.code(409).send({
        error: "delegation_session_not_pending"
      });
    }

    if (!session.claimedBy) {
      return reply.code(409).send({
        error: "delegation_session_not_claimed"
      });
    }

    const now = services.now();
    const updatedSession = {
      ...session,
      claimedBy: undefined,
      claimedAt: undefined,
      claimExpiresAt: undefined,
      updatedAt: now
    };

    await services.store.delegationSessions.upsertSession(updatedSession);

    return {
      session: await hydrateSession(services, updatedSession)
    };
  });

  app.post("/api/v3/delegation-sessions/:sessionId/result", async (request, reply) => {
    const params = z
      .object({
        sessionId: z.string().min(1)
      })
      .parse(request.params);
    const body = SubmitDelegationSessionResultBodySchema.parse(request.body);
    const session = await services.store.delegationSessions.getSession(params.sessionId);

    if (!session) {
      return reply.code(404).send({
        error: "delegation_session_not_found"
      });
    }

    if (session.status !== "pending") {
      return reply.code(409).send({
        error: "delegation_session_not_pending"
      });
    }

    if (session.claimedBy && body.executorId !== session.claimedBy) {
      return reply.code(409).send({
        error: "delegation_session_claim_mismatch"
      });
    }

    const run = await services.store.runs.getRun(session.runId);
    const checkpoint = await services.store.checkpoints.getCheckpoint(
      session.checkpointId
    );

    if (!run || !checkpoint || checkpoint.status !== "pending") {
      return reply.code(409).send({
        error: "delegation_session_checkpoint_not_available"
      });
    }

    const now = services.now();
    const outputArtifactIds: string[] = [];

    for (const [index, artifactInput] of body.artifacts.entries()) {
      const artifactId = buildDelegationArtifactId(session.id, index);
      outputArtifactIds.push(artifactId);
      await services.store.artifacts.writeArtifact({
        id: artifactId,
        runId: run.id,
        kind: artifactInput.kind,
        contentType: artifactInput.contentType,
        storage: artifactInput.storage,
        metadata: {
          ...artifactInput.metadata,
          sessionId: session.id,
          delegationName: session.delegationName,
          agentRef: session.agentRef,
          serviceRef: session.serviceRef,
          sourceCheckpointId: session.checkpointId
        },
        createdAt: now,
        ...(artifactInput.storage === "inline"
          ? {
              inlineData: artifactInput.inlineData
            }
          : {
              blobUri: artifactInput.blobUri
            })
      });
    }

    if (body.status === "completed" && outputArtifactIds.length > 0) {
      await persistRun(services, {
        ...run,
        inputArtifactIds: mergeArtifactIds(run.inputArtifactIds, outputArtifactIds),
        updatedAt: now
      });
    }

    const updatedSession = {
      ...session,
      status: body.status,
      outputArtifactIds,
      result: body.result,
      claimedBy: undefined,
      claimedAt: undefined,
      claimExpiresAt: undefined,
      updatedAt: now,
      resolvedAt: now
    };

    await services.store.delegationSessions.upsertSession(updatedSession);
    await appendRunEvent(services, run.id, "delegation.result.recorded", {
      sessionId: session.id,
      delegationName: session.delegationName,
      serviceRef: session.serviceRef,
      status: body.status,
      artifactIds: outputArtifactIds
    });

    const resolvedCheckpoint = CheckpointSchema.parse({
      ...checkpoint,
      status: "resolved",
      response: {
        status: body.status,
        sessionId: session.id,
        serviceRef: session.serviceRef,
        artifactIds: outputArtifactIds,
        result: body.result
      },
      resolvedAt: now
    });

    await services.store.checkpoints.upsertCheckpoint(resolvedCheckpoint);

    if (body.status === "failed") {
      await appendRunEvent(services, run.id, "run.failed", {
        reason: "subagent_failed",
        sessionId: session.id,
        delegationName: session.delegationName,
        serviceRef: session.serviceRef
      });
      await persistRun(services, {
        ...run,
        status: "failed",
        updatedAt: now
      });
      await services.store.engineStates.deleteState(run.id);

      return reply.code(202).send({
        accepted: true,
        session: updatedSession
      });
    }

    await services.resumeRunFromCheckpoint({
      runId: run.id,
      checkpointId: checkpoint.id,
      response: resolvedCheckpoint.response
    });

    return reply.code(202).send({
      accepted: true,
      session: updatedSession
    });
  });
};
