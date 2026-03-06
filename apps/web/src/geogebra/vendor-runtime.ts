export interface GeoGebraVendorManifest {
  deployScriptPath: string;
  html5CodebasePath: string;
}

export interface GeoGebraRuntimeConfig {
  deployScriptUrl: string;
  html5CodebaseUrl: string;
}

const normalizeBaseUrl = (baseUrl: string): string => {
  if (!baseUrl || baseUrl === "/") {
    return "/";
  }

  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
};

export const resolveVendorAssetUrl = (
  baseUrl: string,
  absoluteAssetPath: string
): string => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  if (!absoluteAssetPath.startsWith("/")) {
    throw new Error("GeoGebra vendor asset paths must be absolute");
  }

  if (normalizedBaseUrl === "/") {
    return absoluteAssetPath;
  }

  return `${normalizedBaseUrl.slice(0, -1)}${absoluteAssetPath}`;
};

export const toGeoGebraRuntimeConfig = (
  manifest: GeoGebraVendorManifest,
  baseUrl: string
): GeoGebraRuntimeConfig => ({
  deployScriptUrl: resolveVendorAssetUrl(baseUrl, manifest.deployScriptPath),
  html5CodebaseUrl: resolveVendorAssetUrl(baseUrl, manifest.html5CodebasePath)
});
