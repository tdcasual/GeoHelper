import type { Artifact } from "@geohelper/agent-protocol";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ControlPlaneServices } from "../control-plane-context";

const AdminEvalFailuresQuerySchema = z.object({
  runId: z.string().min(1).optional()
});

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const readBooleanFlag = (
  record: Record<string, unknown> | null,
  key: string
): boolean | null => {
  if (!record || typeof record[key] !== "boolean") {
    return null;
  }

  return record[key] as boolean;
};

const readStringValue = (
  record: Record<string, unknown> | null,
  key: string
): string | null => {
  if (!record || typeof record[key] !== "string") {
    return null;
  }

  return record[key] as string;
};

const isFailedEvaluationArtifact = (artifact: Artifact): boolean => {
  const metadata = toRecord(artifact.metadata);
  const inlineData = toRecord(artifact.inlineData);
  const ready =
    readBooleanFlag(inlineData, "ready") ?? readBooleanFlag(metadata, "ready");
  const passed =
    readBooleanFlag(inlineData, "passed") ??
    readBooleanFlag(metadata, "passed");
  const status =
    readStringValue(inlineData, "status") ?? readStringValue(metadata, "status");
  const outcome =
    readStringValue(inlineData, "outcome") ??
    readStringValue(metadata, "outcome");

  return (
    ready === false ||
    passed === false ||
    status === "failed" ||
    outcome === "failed"
  );
};

const getEvaluatorName = (artifact: Artifact): string | null => {
  const metadata = toRecord(artifact.metadata);
  const inlineData = toRecord(artifact.inlineData);

  return (
    readStringValue(inlineData, "evaluator") ??
    readStringValue(inlineData, "evaluatorName") ??
    readStringValue(metadata, "evaluator") ??
    readStringValue(metadata, "evaluatorName") ??
    readStringValue(metadata, "source")
  );
};

export const registerAdminEvalsRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.get("/admin/evals/failures", async (request) => {
    const query = AdminEvalFailuresQuerySchema.parse(request.query);
    const snapshots = query.runId
      ? [await services.store.loadRunSnapshot(query.runId)].filter(Boolean)
      : await Promise.all(
          (await services.store.runs.listRuns()).map((run) =>
            services.store.loadRunSnapshot(run.id)
          )
        );

    const evalFailures = snapshots
      .flatMap((snapshot) =>
        (snapshot?.artifacts ?? [])
          .filter(
            (artifact) =>
              artifact.kind === "evaluation" &&
              isFailedEvaluationArtifact(artifact)
          )
          .map((artifact) => ({
            evaluator: getEvaluatorName(artifact),
            run: snapshot!.run,
            artifact
          }))
      )
      .sort((left, right) =>
        right.artifact.createdAt.localeCompare(left.artifact.createdAt)
      );

    return {
      evalFailures
    };
  });
};
