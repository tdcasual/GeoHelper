export interface GatewayAlertEvent {
  traceId: string;
  path: string;
  method: string;
  statusCode: number;
  error?: string;
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
        ...event
      })
    });
  } catch {
    // Alerting must not break request lifecycle.
  }
};
