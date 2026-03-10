import { createHmac } from "node:crypto";

import { GatewayConfig } from "../config";
import {
  createMemorySessionRevocationStore,
  SessionRevocationStore
} from "./session-store";

export interface SessionPayload {
  device_id: string;
  exp: number;
  iat: number;
  jti: string;
}

const defaultSessionRevocationStore = createMemorySessionRevocationStore();

const signPayload = (payloadB64: string, secret: string): string =>
  createHmac("sha256", secret).update(payloadB64).digest("base64url");

const sessionHash = (token: string): string =>
  createHmac("sha256", "geohelper-session-revocation")
    .update(token)
    .digest("hex");

const decodeSessionPayload = (payloadB64: string): SessionPayload | null => {
  try {
    return JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as SessionPayload;
  } catch {
    return null;
  }
};

export const getDefaultSessionRevocationStore = (): SessionRevocationStore =>
  defaultSessionRevocationStore;

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

export const revokeSessionToken = async (
  token: string,
  payload: SessionPayload,
  store: SessionRevocationStore = defaultSessionRevocationStore
): Promise<void> => {
  const ttlSeconds = Math.max(1, payload.exp - Math.floor(Date.now() / 1000));
  await store.add(sessionHash(token), ttlSeconds);
};

export const clearRevokedSessions = async (
  store: SessionRevocationStore = defaultSessionRevocationStore
): Promise<void> => {
  await store.clear();
};

export const verifySessionToken = async (
  token: string,
  config: GatewayConfig,
  store: SessionRevocationStore = defaultSessionRevocationStore
): Promise<SessionPayload | null> => {
  if (await store.has(sessionHash(token))) {
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

  const payload = decodeSessionPayload(payloadB64);
  if (!payload) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    return null;
  }

  return payload;
};
