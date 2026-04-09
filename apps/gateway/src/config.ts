import { hkdfSync } from "node:crypto";

export interface GatewayConfig {
  port: number;
  presetToken: string;
  appSecret: string;
  sessionSecret: string;
  sessionTtlSeconds: number;
  redisUrl?: string;
  alertWebhookUrl?: string;
  adminMetricsToken?: string;
  backupMaxHistory: number;
  backupMaxProtected: number;
  attachmentsEnabled: boolean;
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
  const portFromEnv = Number(env.PORT ?? 8787);
  const port = Number.isNaN(portFromEnv) ? 8787 : portFromEnv;
  const sessionTtlFromEnv = Number(env.SESSION_TTL_SECONDS ?? 1800);
  const sessionTtlSeconds = Number.isNaN(sessionTtlFromEnv)
    ? 1800
    : sessionTtlFromEnv;
  const backupMaxHistoryFromEnv = Number(env.BACKUP_MAX_HISTORY ?? 10);
  const backupMaxProtectedFromEnv = Number(env.BACKUP_MAX_PROTECTED ?? 20);
  const appSecret = env.APP_SECRET ?? "geohelper-dev-app-secret";
  const sessionSecret =
    env.SESSION_SECRET?.trim() || deriveSessionSecret(appSecret);

  return {
    port,
    presetToken: env.PRESET_TOKEN ?? "",
    appSecret,
    sessionSecret,
    sessionTtlSeconds,
    redisUrl: env.REDIS_URL?.trim() || undefined,
    alertWebhookUrl: env.ALERT_WEBHOOK_URL,
    adminMetricsToken: env.ADMIN_METRICS_TOKEN,
    backupMaxHistory: Number.isNaN(backupMaxHistoryFromEnv)
      ? 10
      : Math.max(1, Math.floor(backupMaxHistoryFromEnv)),
    backupMaxProtected: Number.isNaN(backupMaxProtectedFromEnv)
      ? 20
      : Math.max(1, Math.floor(backupMaxProtectedFromEnv)),
    attachmentsEnabled: env.GATEWAY_ENABLE_ATTACHMENTS === "1"
  };
};
