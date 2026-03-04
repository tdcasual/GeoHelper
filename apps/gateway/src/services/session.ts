import { createHmac } from "node:crypto";

import { GatewayConfig } from "../config";

export interface SessionPayload {
  device_id: string;
  exp: number;
  iat: number;
  jti: string;
}

const signPayload = (payloadB64: string, secret: string): string =>
  createHmac("sha256", secret).update(payloadB64).digest("base64url");

const sessionHash = (token: string): string =>
  createHmac("sha256", "geohelper-session-revocation")
    .update(token)
    .digest("hex");

const revokedSessionHashes = new Set<string>();

export const issueSessionToken = (
  deviceId: string,
  config: GatewayConfig
): string => {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + config.sessionTtlSeconds;
  const jti = createHmac("sha256", config.sessionSecret)
    .update(`${deviceId}:${iat}:${Math.random()}`)
    .digest("hex")
    .slice(0, 24);
  const payload: SessionPayload = {
    device_id: deviceId,
    exp,
    iat,
    jti
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const signature = signPayload(payloadB64, config.sessionSecret);

  return `${payloadB64}.${signature}`;
};

export const revokeSessionToken = (token: string): void => {
  revokedSessionHashes.add(sessionHash(token));
};

export const clearRevokedSessions = (): void => {
  revokedSessionHashes.clear();
};

export const verifySessionToken = (
  token: string,
  config: GatewayConfig
): SessionPayload | null => {
  if (revokedSessionHashes.has(sessionHash(token))) {
    return null;
  }

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
