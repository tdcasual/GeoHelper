export interface GatewayConfig {
  port: number;
  presetToken: string;
  sessionSecret: string;
  sessionTtlSeconds: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  alertWebhookUrl?: string;
}

export const loadConfig = (
  envOverrides: Partial<NodeJS.ProcessEnv> = {}
): GatewayConfig => {
  const env = { ...process.env, ...envOverrides };
  const portFromEnv = Number(env.PORT ?? 8787);
  const port = Number.isNaN(portFromEnv) ? 8787 : portFromEnv;
  const sessionTtlFromEnv = Number(env.SESSION_TTL_SECONDS ?? 1800);
  const sessionTtlSeconds = Number.isNaN(sessionTtlFromEnv)
    ? 1800
    : sessionTtlFromEnv;
  const rateLimitMaxFromEnv = Number(env.RATE_LIMIT_MAX ?? 120);
  const rateLimitWindowFromEnv = Number(env.RATE_LIMIT_WINDOW_MS ?? 60_000);

  return {
    port,
    presetToken: env.PRESET_TOKEN ?? "",
    sessionSecret: env.SESSION_SECRET ?? "dev-session-secret",
    sessionTtlSeconds,
    rateLimitMax: Number.isNaN(rateLimitMaxFromEnv) ? 120 : rateLimitMaxFromEnv,
    rateLimitWindowMs: Number.isNaN(rateLimitWindowFromEnv)
      ? 60_000
      : rateLimitWindowFromEnv,
    alertWebhookUrl: env.ALERT_WEBHOOK_URL
  };
};
