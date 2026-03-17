import { GatewayConfig } from "../config";
import { GatewayAlertUpstreamContext } from "../services/alerting";
import { CompileMode } from "../services/litellm-client";
import { resolveUpstreamTargets } from "../services/model-router";

export interface LegacyAgentStep {
  name: string;
  status: "ok" | "fallback" | "error" | "skipped";
  duration_ms: number;
  detail?: string;
}

const mapLegacyStepName = (name: string): string => {
  if (name === "author") {
    return "author";
  }
  if (name.startsWith("reviewer_")) {
    return name;
  }
  if (name.startsWith("reviser_")) {
    return "repair";
  }
  if (name === "preflight") {
    return "verifier";
  }

  return name;
};

export const toLegacyAgentSteps = (
  stages: Array<{
    name: string;
    status: "ok" | "fallback" | "error" | "skipped";
    durationMs: number;
    detail?: string;
  }>
): LegacyAgentStep[] =>
  stages.map((stage) => ({
    name: mapLegacyStepName(stage.name),
    status: stage.status,
    duration_ms: stage.durationMs,
    detail: stage.detail
  }));

export const buildCompileAlertUpstream = (
  config: GatewayConfig,
  input: {
    mode: CompileMode;
    model?: string;
    byokEndpoint?: string;
    byokKey?: string;
  }
): GatewayAlertUpstreamContext | undefined => {
  try {
    const targets = resolveUpstreamTargets(
      {
        byokEndpoint: input.byokEndpoint,
        byokKey: input.byokKey,
        model: input.model
      },
      {
        LITELLM_ENDPOINT: config.litellmEndpoint,
        LITELLM_API_KEY: config.litellmApiKey,
        LITELLM_MODEL: config.litellmModel,
        LITELLM_FALLBACK_ENDPOINT: config.litellmFallbackEndpoint,
        LITELLM_FALLBACK_API_KEY: config.litellmFallbackApiKey,
        LITELLM_FALLBACK_MODEL: config.litellmFallbackModel
      }
    );

    return {
      mode: input.mode,
      targets: targets.map((target) => ({
        source: target.source,
        endpoint: target.endpoint,
        model: target.model
      }))
    };
  } catch {
    return undefined;
  }
};
