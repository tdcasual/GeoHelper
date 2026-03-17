import {
  type GeoGebraVendorManifest,
  resolveVendorAssetUrl} from "../../geogebra/vendor-runtime";

export const GGB_MANIFEST_PATH = "/vendor/geogebra/manifest.json";

export type CanvasUiProfile = "desktop" | "mobile";
export type GeoGebraListener = ((...args: unknown[]) => void) | string;

export interface GeoGebraAppletObject {
  evalCommand?: (command: string) => void;
  setValue?: (name: string, value: number) => void;
  setSize?: (width: number, height: number) => void;
  recalculateEnvironments?: () => void;
  getXML?: () => string;
  setXML?: (xml: string) => void;
  focusObjects?: (objectLabels: string[]) => boolean;
  clearFocusedObjects?: () => void;
  setSelectedObject?: (label: string, selected: boolean) => void;
  clearSelectedObjects?: () => void;
  registerAddListener?: (listener: GeoGebraListener) => void;
  unregisterAddListener?: (listener: GeoGebraListener) => void;
  registerUpdateListener?: (listener: GeoGebraListener) => void;
  unregisterUpdateListener?: (listener: GeoGebraListener) => void;
  registerRemoveListener?: (listener: GeoGebraListener) => void;
  unregisterRemoveListener?: (listener: GeoGebraListener) => void;
  registerClearListener?: (listener: GeoGebraListener) => void;
  unregisterClearListener?: (listener: GeoGebraListener) => void;
  registerRenameListener?: (listener: GeoGebraListener) => void;
  unregisterRenameListener?: (listener: GeoGebraListener) => void;
}

let ggbLoaderPromise: Promise<void> | null = null;
let ggbLoaderUrl: string | null = null;

export const loadGeoGebraManifest = async (
  baseUrl: string
): Promise<GeoGebraVendorManifest> => {
  const response = await fetch(resolveVendorAssetUrl(baseUrl, GGB_MANIFEST_PATH));

  if (!response.ok) {
    throw new Error("Failed to load GeoGebra vendor manifest");
  }

  return (await response.json()) as GeoGebraVendorManifest;
};

export const ensureGeoGebraScript = async (scriptUrl: string): Promise<void> => {
  if (typeof window === "undefined") {
    throw new Error("window is unavailable");
  }

  if (window.GGBApplet && ggbLoaderUrl === scriptUrl) {
    return;
  }

  if (!ggbLoaderPromise || ggbLoaderUrl !== scriptUrl) {
    ggbLoaderUrl = scriptUrl;
    ggbLoaderPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      script.dataset.geohelperGeogebra = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load GeoGebra script"));
      document.head.appendChild(script);
    });
  }

  try {
    await ggbLoaderPromise;
  } catch (error) {
    ggbLoaderPromise = null;
    ggbLoaderUrl = null;
    throw error;
  }
};

export const getLiveAppletObject = (): GeoGebraAppletObject | null => {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    (window as Window & { ggbApplet?: GeoGebraAppletObject }).ggbApplet ?? null
  );
};

export const resolveAppletObject = (
  appletObject: unknown
): GeoGebraAppletObject | null => {
  const raw = appletObject as GeoGebraAppletObject | null | undefined;
  return raw ?? getLiveAppletObject();
};

export const toAppletConfig = (
  profile: CanvasUiProfile,
  onLoad?: (appletObject: unknown) => void
) => ({
  appName: "classic",
  perspective: profile === "mobile" ? "G" : undefined,
  preventFocus: true,
  showToolBar: true,
  showAlgebraInput: profile === "desktop",
  showMenuBar: profile === "desktop",
  showToolBarHelp: profile === "desktop",
  enableFileFeatures: true,
  showFullscreenButton: true,
  showResetIcon: true,
  disableAutoScale: true,
  language: "zh",
  ...(onLoad ? { appletOnLoad: onLoad } : {})
});
