import { GatewayConfig } from "../config";

export const validatePresetToken = (
  providedToken: string,
  config: GatewayConfig
): boolean => {
  if (!config.presetToken) {
    return false;
  }

  return providedToken === config.presetToken;
};
