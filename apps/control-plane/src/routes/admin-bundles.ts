import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ControlPlaneServices } from "../control-plane-context";

const ExportBundleParamsSchema = z.object({
  agentId: z.string().min(1)
});

const ExportBundleBodySchema = z.object({
  outputDir: z.string().min(1).optional()
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

      return {
        export: {
          agentId: result.agentId,
          bundleId: result.bundleId,
          outputDir: result.outputDir,
          report: result.report
        }
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
