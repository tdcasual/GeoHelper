import type { CompileInput } from "./litellm-client";

export interface UpstreamTarget {
  endpoint: string;
  apiKey: string;
  model: string;
  source: "byok" | "primary" | "fallback";
}

const DEFAULT_MODEL = "gpt-4o-mini";

const normalizeEndpoint = (endpoint?: string): string =>
  (endpoint ?? "").trim().replace(/\/+$/, "");

const dedupeTargets = (targets: UpstreamTarget[]): UpstreamTarget[] => {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.endpoint}|${target.model}|${target.apiKey}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const resolveUpstreamTargets = (
  input: Pick<CompileInput, "byokEndpoint" | "byokKey" | "model">,
  env: Partial<NodeJS.ProcessEnv> = process.env
): UpstreamTarget[] => {
  const requestedModel = input.model?.trim();

  if (input.byokEndpoint?.trim()) {
    return [
      {
        endpoint: normalizeEndpoint(input.byokEndpoint),
        apiKey: input.byokKey?.trim() ?? "",
        model: requestedModel || env.LITELLM_MODEL?.trim() || DEFAULT_MODEL,
        source: "byok"
      }
    ];
  }

  const primaryEndpoint = normalizeEndpoint(env.LITELLM_ENDPOINT);
  if (!primaryEndpoint) {
    throw new Error("LITELLM_ENDPOINT_MISSING");
  }

  const primaryModel = requestedModel || env.LITELLM_MODEL?.trim() || DEFAULT_MODEL;
  const targets: UpstreamTarget[] = [
    {
      endpoint: primaryEndpoint,
      apiKey: env.LITELLM_API_KEY?.trim() ?? "",
      model: primaryModel,
      source: "primary"
    }
  ];

  const fallbackEndpoint = normalizeEndpoint(env.LITELLM_FALLBACK_ENDPOINT);
  if (fallbackEndpoint) {
    targets.push({
      endpoint: fallbackEndpoint,
      apiKey:
        env.LITELLM_FALLBACK_API_KEY?.trim() ?? env.LITELLM_API_KEY?.trim() ?? "",
      model: env.LITELLM_FALLBACK_MODEL?.trim() || primaryModel,
      source: "fallback"
    });
  }

  return dedupeTargets(targets);
};

export const isTransientUpstreamStatus = (status: number): boolean =>
  status === 408 ||
  status === 409 ||
  status === 425 ||
  status === 429 ||
  status >= 500;
