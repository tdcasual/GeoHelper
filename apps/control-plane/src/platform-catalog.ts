import type { ControlPlaneServices } from "./control-plane-context";

interface ToolCatalogEntry {
  name: string;
  kind: string;
  permissions: string[];
  retryable: boolean;
}

interface EvaluatorCatalogEntry {
  name: string;
}

const byStringField =
  <T>(select: (value: T) => string) =>
  (left: T, right: T): number =>
    select(left).localeCompare(select(right));

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const toToolCatalogEntry = (value: unknown): ToolCatalogEntry | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ToolCatalogEntry>;

  if (
    typeof candidate.name !== "string" ||
    typeof candidate.kind !== "string" ||
    !isStringArray(candidate.permissions) ||
    typeof candidate.retryable !== "boolean"
  ) {
    return null;
  }

  return {
    name: candidate.name,
    kind: candidate.kind,
    permissions: [...candidate.permissions],
    retryable: candidate.retryable
  };
};

const toEvaluatorCatalogEntry = (value: unknown): EvaluatorCatalogEntry | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<EvaluatorCatalogEntry>;

  if (typeof candidate.name !== "string") {
    return null;
  }

  return {
    name: candidate.name
  };
};

export const createPlatformCatalogSnapshot = (
  services: Pick<ControlPlaneServices, "platformRuntime">
) => ({
  runProfiles: [...services.platformRuntime.runProfiles.values()].sort(
    byStringField((profile) => profile.id)
  ),
  agents: Object.values(services.platformRuntime.agents).sort(
    byStringField((agent) => agent.id)
  ),
  workflows: Object.values(services.platformRuntime.workflows).sort(
    byStringField((workflow) => workflow.id)
  ),
  tools: Object.values(services.platformRuntime.tools)
    .flatMap((tool) => {
      const entry = toToolCatalogEntry(tool);

      return entry ? [entry] : [];
    })
    .sort(byStringField((tool) => tool.name)),
  evaluators: Object.values(services.platformRuntime.evaluators)
    .flatMap((evaluator) => {
      const entry = toEvaluatorCatalogEntry(evaluator);

      return entry ? [entry] : [];
    })
    .sort(byStringField((evaluator) => evaluator.name))
});
