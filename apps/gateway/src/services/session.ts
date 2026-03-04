import { createHmac } from "node:crypto";

import { GatewayConfig } from "../config";

export interface SessionPayload {
  device_id: string;
  exp: number;
  iat: number;
}

const signPayload = (payloadB64: string, secret: string): string =>
  createHmac("sha256", secret).update(payloadB64).digest("base64url");

export const issueSessionToken = (
  deviceId: string,
  config: GatewayConfig
): string => {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + config.sessionTtlSeconds;
  const payload: SessionPayload = {
    device_id: deviceId,
    exp,
    iat
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const signature = signPayload(payloadB64, config.sessionSecret);

  return `${payloadB64}.${signature}`;
};

export const verifySessionToken = (
  token: string,
  config: GatewayConfig
): SessionPayload | null => {
  const [payloadB64, signature] = token.split(".");

  if (!payloadB64 || !signature) {
    return null;
  }

  const expectedSig = signPayload(payloadB64, config.sessionSecret);
  if (expectedSig !== signature) {
    return null;
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as SessionPayload;
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    return null;
  }

  return payload;
};
