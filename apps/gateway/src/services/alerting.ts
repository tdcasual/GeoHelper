export interface GatewayAlertEvent {
  traceId: string;
  path: string;
  method: string;
  statusCode: number;
  error?: string;
  event?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
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
    // Alerting must not break request lifecycle.
  }
};
