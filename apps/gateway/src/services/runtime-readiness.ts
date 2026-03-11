export interface RuntimeDependencyCheck {
  name: string;
  check: () => Promise<void>;
}

export interface RuntimeReadinessDependencyFailure {
  name: string;
  ok: false;
  detail: string;
}

export interface RuntimeReadinessSnapshot {
  ready: boolean;
  dependencies: RuntimeReadinessDependencyFailure[];
}

export interface RuntimeReadinessService {
  snapshot: () => Promise<RuntimeReadinessSnapshot>;
}

const resolveFailureDetail = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "DEPENDENCY_UNAVAILABLE";
};

export const createRuntimeReadinessService = (
  checks: RuntimeDependencyCheck[] = []
): RuntimeReadinessService => ({
  snapshot: async () => {
    const dependencies: RuntimeReadinessDependencyFailure[] = [];

    for (const dependency of checks) {
      try {
        await dependency.check();
      } catch (error) {
        dependencies.push({
          name: dependency.name,
          ok: false,
          detail: resolveFailureDetail(error)
        });
      }
    }

    return {
      ready: dependencies.length === 0,
      dependencies
    };
  }
});

export const createRedisRuntimeDependencyCheck = (kvClient: {
  get: (key: string) => Promise<string | null>;
}): RuntimeDependencyCheck => ({
  name: "redis",
  check: async () => {
    await kvClient.get("geohelper:ready-probe");
  }
});
