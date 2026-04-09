import { GatewayConfig } from "../config";
import { GatewayBuildInfo } from "./build-info";
import {
  createMemoryMetricsStore,
  GatewayMetricsStore
} from "./metrics-store";

const defaultMetricsStore = createMemoryMetricsStore();

export const getDefaultMetricsStore = (): GatewayMetricsStore =>
  defaultMetricsStore;

export const resetGatewayMetrics = (
  store: GatewayMetricsStore = defaultMetricsStore
): void => {
  store.reset();
};

export const getGatewayMetricsSnapshot = (input: {
  store?: GatewayMetricsStore;
  config: Pick<
    GatewayConfig,
    "presetToken" | "adminMetricsToken" | "alertWebhookUrl"
  >;
  buildInfo: Pick<
    GatewayBuildInfo,
    "redis_enabled" | "attachments_enabled"
  >;
}) => {
  const state = (input.store ?? defaultMetricsStore).readState();
  const redisEnabled = input.buildInfo.redis_enabled;

  return {
    started_at: state.startedAt,
    gateway: {
      official_auth_enabled: Boolean(input.config.presetToken),
      admin_token_enabled: Boolean(input.config.adminMetricsToken),
      alert_webhook_enabled: Boolean(input.config.alertWebhookUrl),
      redis_enabled: redisEnabled,
      backup_storage: redisEnabled ? "redis" : "memory",
      session_revocation_storage: redisEnabled ? "redis" : "memory",
      attachments_enabled: input.buildInfo.attachments_enabled,
      trace_header_name: "x-trace-id"
    }
  };
};
