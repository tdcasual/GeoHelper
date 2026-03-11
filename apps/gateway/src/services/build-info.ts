import { GatewayConfig } from "../config";

export interface GatewayBuildInfo {
  git_sha: string | null;
  build_time: string | null;
  node_env: string;
  redis_enabled: boolean;
}

export interface GatewayBuildIdentity {
  git_sha: string | null;
  build_time: string | null;
  node_env: string;
  redis_enabled: boolean;
}

export const createGatewayBuildInfo = (
  envOverrides: Partial<NodeJS.ProcessEnv>,
  config: GatewayConfig
): GatewayBuildInfo => {
  const env = { ...process.env, ...envOverrides };

  return {
    git_sha: env.GEOHELPER_BUILD_SHA?.trim() || null,
    build_time: env.GEOHELPER_BUILD_TIME?.trim() || null,
    node_env: env.NODE_ENV?.trim() || "development",
    redis_enabled: Boolean(config.redisUrl)
  };
};

export const getGatewayBuildIdentity = (
  buildInfo: GatewayBuildInfo
): GatewayBuildIdentity => ({
  git_sha: buildInfo.git_sha,
  build_time: buildInfo.build_time,
  node_env: buildInfo.node_env,
  redis_enabled: buildInfo.redis_enabled
});
