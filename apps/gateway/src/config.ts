import { hkdfSync } from "node:crypto";

export interface GatewayConfig {
  port: number;
  presetToken: string;
  appSecret: string;
  sessionSecret: string;
  sessionTtlSeconds: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  redisUrl?: string;
  litellmEndpoint?: string;
  litellmApiKey?: string;
  litellmModel: string;
  litellmFallbackEndpoint?: string;
  litellmFallbackApiKey?: string;
  litellmFallbackModel?: string;
  alertWebhookUrl?: string;
  adminMetricsToken?: string;
  costPerRequestUsd: number;
}

const deriveSessionSecret = (appSecret: string): string =>
  Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(appSecret, "utf8"),
      Buffer.from("geohelper-session-salt-v1", "utf8"),
      Buffer.from("geohelper-session-signing", "utf8"),
      32
    )
  ).toString("base64url");

export const loadConfig = (
  envOverrides: Partial<NodeJS.ProcessEnv> = {}
): GatewayConfig => {
  const env = { ...process.env, ...envOverrides };
  const isProduction = env.NODE_ENV === "production";

  if (isProduction && !env.APP_SECRET?.trim()) {
    throw new Error("APP_SECRET_REQUIRED");
  }

  if (isProduction && !env.LITELLM_ENDPOINT?.trim()) {
    throw new Error("LITELLM_ENDPOINT_REQUIRED");
  }
  const portFromEnv = Number(env.PORT ?? 8787);
  const port = Number.isNaN(portFromEnv) ? 8787 : portFromEnv;
  const sessionTtlFromEnv = Number(env.SESSION_TTL_SECONDS ?? 1800);
  const sessionTtlSeconds = Number.isNaN(sessionTtlFromEnv)
    ? 1800
    : sessionTtlFromEnv;
  const rateLimitMaxFromEnv = Number(env.RATE_LIMIT_MAX ?? 120);
  const rateLimitWindowFromEnv = Number(env.RATE_LIMIT_WINDOW_MS ?? 60_000);
  const costPerRequestFromEnv = Number(env.COST_PER_REQUEST_USD ?? 0);
  const appSecret = env.APP_SECRET ?? "geohelper-dev-app-secret";
  const sessionSecret =
    env.SESSION_SECRET?.trim() || deriveSessionSecret(appSecret);

  return {
    port,
    presetToken: env.PRESET_TOKEN ?? "",
    appSecret,
    sessionSecret,
    sessionTtlSeconds,
    rateLimitMax: Number.isNaN(rateLimitMaxFromEnv) ? 120 : rateLimitMaxFromEnv,
    rateLimitWindowMs: Number.isNaN(rateLimitWindowFromEnv)
      ? 60_000
      : rateLimitWindowFromEnv,
    redisUrl: env.REDIS_URL?.trim() || undefined,
    litellmEndpoint: env.LITELLM_ENDPOINT?.trim() || undefined,
    litellmApiKey: env.LITELLM_API_KEY?.trim() || undefined,
    litellmModel: env.LITELLM_MODEL?.trim() || "gpt-4o-mini",
    litellmFallbackEndpoint: env.LITELLM_FALLBACK_ENDPOINT?.trim() || undefined,
    litellmFallbackApiKey: env.LITELLM_FALLBACK_API_KEY?.trim() || undefined,
    litellmFallbackModel: env.LITELLM_FALLBACK_MODEL?.trim() || undefined,
    alertWebhookUrl: env.ALERT_WEBHOOK_URL,
    adminMetricsToken: env.ADMIN_METRICS_TOKEN,
    costPerRequestUsd: Number.isNaN(costPerRequestFromEnv)
      ? 0
      : Math.max(0, costPerRequestFromEnv)
  };
};
