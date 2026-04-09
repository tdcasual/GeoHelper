import type { FastifyInstance } from "fastify";

import type { ControlPlaneServices } from "../control-plane-context";

interface ReadinessDependency {
  name: string;
  status: "ok" | "error";
  message?: string;
  details?: Record<string, number>;
}

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "unknown readiness failure";

const buildHealthPayload = (
  services: Pick<ControlPlaneServices, "now">
): {
  status: "ok";
  service: "control-plane";
  time: string;
} => ({
  status: "ok",
  service: "control-plane",
  time: services.now()
});

const buildReadinessPayload = async (
  services: Pick<
    ControlPlaneServices,
    "store" | "platformRuntime" | "runProfiles" | "executionMode" | "now"
  >
): Promise<{
  ready: boolean;
  service: "control-plane";
  time: string;
  executionMode: ControlPlaneServices["executionMode"];
  dependencies: ReadinessDependency[];
}> => {
  const dependencies: ReadinessDependency[] = [];

  try {
    await services.store.threads.listThreads();
    dependencies.push({
      name: "agent_store",
      status: "ok"
    });
  } catch (error) {
    dependencies.push({
      name: "agent_store",
      status: "error",
      message: toErrorMessage(error)
    });
  }

  const runProfileCount = services.runProfiles.size;
  const agentCount = Object.keys(services.platformRuntime.agents).length;
  const workflowCount = Object.keys(services.platformRuntime.workflows).length;

  if (runProfileCount > 0 && agentCount > 0 && workflowCount > 0) {
    dependencies.push({
      name: "runtime_registry",
      status: "ok",
      details: {
        runProfileCount,
        agentCount,
        workflowCount
      }
    });
  } else {
    dependencies.push({
      name: "runtime_registry",
      status: "error",
      message:
        runProfileCount === 0
          ? "no run profiles registered"
          : agentCount === 0
            ? "no agents registered"
            : "no workflows registered",
      details: {
        runProfileCount,
        agentCount,
        workflowCount
      }
    });
  }

  const ready = dependencies.every((dependency) => dependency.status === "ok");

  return {
    ready,
    service: "control-plane",
    time: services.now(),
    executionMode: services.executionMode,
    dependencies
  };
};

export const registerHealthRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.get("/api/v3/health", async () => buildHealthPayload(services));

  app.get("/api/v3/ready", async (_, reply) => {
    const payload = await buildReadinessPayload(services);
    if (!payload.ready) {
      reply.code(503);
    }

    return payload;
  });
};
