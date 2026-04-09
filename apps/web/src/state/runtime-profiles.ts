export interface RuntimeProfileBase {
  id: string;
  name: string;
  updatedAt: number;
}

export interface GatewayRuntimeProfile extends RuntimeProfileBase {
  target: "gateway";
  gatewayBaseUrl: string;
  controlPlaneBaseUrl: string;
}

export interface DirectRuntimeProfile extends RuntimeProfileBase {
  target: "direct";
  providerBaseUrl: string;
}

export type RuntimeProfile = GatewayRuntimeProfile | DirectRuntimeProfile;

export type UpsertRuntimeProfileInput =
  | {
      id?: string;
      name: string;
      target: "gateway";
      gatewayBaseUrl: string;
      controlPlaneBaseUrl: string;
    }
  | {
      id?: string;
      name: string;
      target: "direct";
      providerBaseUrl: string;
    };

export const normalizeRuntimeEndpointUrl = (value?: string): string =>
  (value ?? "").trim().replace(/\/+$/, "");

export const isGatewayRuntimeProfile = (
  profile: RuntimeProfile | null | undefined
): profile is GatewayRuntimeProfile => profile?.target === "gateway";

export const isDirectRuntimeProfile = (
  profile: RuntimeProfile | null | undefined
): profile is DirectRuntimeProfile => profile?.target === "direct";

export const getRuntimeGatewayBaseUrl = (
  profile: RuntimeProfile | null | undefined
): string =>
  isGatewayRuntimeProfile(profile)
    ? normalizeRuntimeEndpointUrl(profile.gatewayBaseUrl)
    : "";

export const getRuntimeControlPlaneBaseUrl = (
  profile: RuntimeProfile | null | undefined
): string => {
  if (!isGatewayRuntimeProfile(profile)) {
    return "";
  }

  return (
    normalizeRuntimeEndpointUrl(profile.controlPlaneBaseUrl) ||
    normalizeRuntimeEndpointUrl(profile.gatewayBaseUrl)
  );
};

export const getRuntimeProviderBaseUrl = (
  profile: RuntimeProfile | null | undefined
): string =>
  isDirectRuntimeProfile(profile)
    ? normalizeRuntimeEndpointUrl(profile.providerBaseUrl)
    : "";
