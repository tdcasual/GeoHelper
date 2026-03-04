export interface GatewayConfig {
  port: number;
  presetToken: string;
  sessionSecret: string;
  sessionTtlSeconds: number;
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

  return {
    port,
    presetToken: env.PRESET_TOKEN ?? "",
    sessionSecret: env.SESSION_SECRET ?? "dev-session-secret",
    sessionTtlSeconds
  };
};
