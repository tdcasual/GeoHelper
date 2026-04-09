import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ControlPlaneServices } from "../control-plane-context";

const ExportBundleParamsSchema = z.object({
  agentId: z.string().min(1)
});

const ExportBundleBodySchema = z.object({
  outputDir: z.string().min(1).optional(),
  verifyImport: z.boolean().optional()
});

export const registerAdminBundlesRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.get("/admin/bundles", async () => ({
    bundles: services.listBundles()
  }));

  app.post("/admin/bundles/:agentId/export-openclaw", async (request, reply) => {
    const params = ExportBundleParamsSchema.parse(request.params);
    const body = ExportBundleBodySchema.parse(request.body ?? {});

    try {
      const result = services.exportBundleToOpenClaw({
        agentId: params.agentId,
        outputDir: body.outputDir
      });
      const smoke = body.verifyImport
        ? services.smokeImportOpenClawExport({
            outputDir: result.outputDir
          })
        : null;

      return {
        export: {
          agentId: result.agentId,
          bundleId: result.bundleId,
          outputDir: result.outputDir,
          report: result.report
        },
        audit: {
          bundleId: result.bundleId,
          rehearsedExtractionCandidate:
            result.report.rehearsedExtractionCandidate,
          extractionBlockers: result.report.extractionBlockers,
          verifyImport: smoke
            ? {
                bundleId: smoke.bundleId,
                workflowId: smoke.workflowId,
                cleanExternalMoveReady: smoke.cleanExternalMoveReady,
                extractionBlockers: smoke.extractionBlockers
              }
            : null
        },
        ...(smoke
          ? {
              smoke
            }
          : {})
      };
    } catch (error) {
      if (error instanceof Error && error.message === `bundle_not_found:${params.agentId}`) {
        return reply.code(404).send({
          error: "bundle_not_found"
        });
      }

      throw error;
    }
  });
};
