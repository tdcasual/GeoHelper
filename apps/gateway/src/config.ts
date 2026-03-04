export interface GatewayConfig {
  port: number;
}

export const loadConfig = (): GatewayConfig => {
  const portFromEnv = Number(process.env.PORT ?? 8787);
  const port = Number.isNaN(portFromEnv) ? 8787 : portFromEnv;

  return { port };
};
