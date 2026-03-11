export interface GatewayAlertUpstreamTarget {
  source: string;
  endpoint: string;
  model: string;
}

export interface GatewayAlertUpstreamContext {
  mode: string;
  targets: GatewayAlertUpstreamTarget[];
}

export interface GatewayAlertEvent {
  traceId: string;
  path: string;
  method: string;
  statusCode: number;
  error?: string;
  event?: string;
  finalStatus?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
  git_sha?: string | null;
  build_time?: string | null;
  node_env?: string;
  redis_enabled?: boolean;
  upstream?: GatewayAlertUpstreamContext;
}

export const sendAlert = async (
  webhookUrl: string | undefined,
  event: GatewayAlertEvent
): Promise<void> => {
  if (!webhookUrl) {
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        source: "geohelper-gateway",
        time: new Date().toISOString(),
        ...event
      })
    });
  } catch {
  }
};
