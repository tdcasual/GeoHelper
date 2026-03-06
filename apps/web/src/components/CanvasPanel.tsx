import { useCallback, useEffect, useRef, useState } from "react";

import { GeoGebraAdapter, registerGeoGebraAdapter } from "../geogebra/adapter";
import { toAppletPixelSize } from "../geogebra/applet-size";
import {
  GeoGebraVendorManifest,
  resolveVendorAssetUrl,
  toGeoGebraRuntimeConfig
} from "../geogebra/vendor-runtime";

const GGB_MANIFEST_PATH = "/vendor/geogebra/manifest.json";

export type CanvasUiProfile = "desktop" | "mobile";

interface CanvasPanelProps {
  profile: CanvasUiProfile;
  visible: boolean;
}

type GeoGebraAppletObject = {
  evalCommand?: (command: string) => void;
  setValue?: (name: string, value: number) => void;
  setSize?: (width: number, height: number) => void;
  recalculateEnvironments?: () => void;
};

let ggbLoaderPromise: Promise<void> | null = null;
let ggbLoaderUrl: string | null = null;

const loadGeoGebraManifest = async (): Promise<GeoGebraVendorManifest> => {
  const manifestUrl = resolveVendorAssetUrl(
    import.meta.env.BASE_URL,
    GGB_MANIFEST_PATH
  );
  const response = await fetch(manifestUrl);

  if (!response.ok) {
    throw new Error("Failed to load GeoGebra vendor manifest");
  }

  return (await response.json()) as GeoGebraVendorManifest;
};

const ensureGeoGebraScript = async (scriptUrl: string): Promise<void> => {
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

const getLiveAppletObject = (): GeoGebraAppletObject | null => {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    (window as Window & { ggbApplet?: GeoGebraAppletObject }).ggbApplet ?? null
  );
};

const resolveAppletObject = (
  appletObject: unknown
): GeoGebraAppletObject | null => {
  const raw = appletObject as GeoGebraAppletObject | null | undefined;
  return raw ?? getLiveAppletObject();
};

const toGeoGebraAdapter = (appletObject: unknown): GeoGebraAdapter => {
  const raw = resolveAppletObject(appletObject);

  return {
    evalCommand: (command) => raw?.evalCommand?.(command),
    setValue: (name, value) => raw?.setValue?.(name, value)
  };
};

const toAppletConfig = (profile: CanvasUiProfile) => ({
  appName: profile === "mobile" ? "geometry" : "classic",
  showToolBar: true,
  showAlgebraInput: profile === "desktop",
  showMenuBar: profile === "desktop",
  showToolBarHelp: profile === "desktop",
  enableFileFeatures: true,
  showFullscreenButton: true,
  showResetIcon: true,
  language: "zh"
});

export const CanvasPanel = ({ profile, visible }: CanvasPanelProps) => {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appletObjectRef = useRef<GeoGebraAppletObject | null>(null);
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);
  const resizeFrameRef = useRef<number | null>(null);

  const syncAppletSize = useCallback(() => {
    const host = hostRef.current;
    const appletObject = appletObjectRef.current?.setSize
      ? appletObjectRef.current
      : getLiveAppletObject();

    if (appletObject && appletObjectRef.current !== appletObject) {
      appletObjectRef.current = appletObject;
      registerGeoGebraAdapter(toGeoGebraAdapter(appletObject));
    }

    if (!host || !appletObject?.setSize) {
      return;
    }

    const bounds = host.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    const nextSize = toAppletPixelSize(bounds);
    if (
      lastSizeRef.current?.width === nextSize.width &&
      lastSizeRef.current?.height === nextSize.height
    ) {
      return;
    }

    lastSizeRef.current = nextSize;
    appletObject.setSize(nextSize.width, nextSize.height);
    appletObject.recalculateEnvironments?.();
  }, []);

  const scheduleAppletResize = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current);
    }

    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      syncAppletSize();
    });
  }, [syncAppletSize]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      scheduleAppletResize();
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [scheduleAppletResize]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    scheduleAppletResize();
    const timeoutId = window.setTimeout(() => {
      scheduleAppletResize();
    }, 120);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [scheduleAppletResize, visible]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleViewportChange = () => {
      scheduleAppletResize();
      window.setTimeout(() => {
        scheduleAppletResize();
      }, 80);
    };

    window.addEventListener("orientationchange", handleViewportChange);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      window.removeEventListener("orientationchange", handleViewportChange);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [scheduleAppletResize]);

  useEffect(() => {
    let disposed = false;

    const bootstrap = async () => {
      try {
        const manifest = await loadGeoGebraManifest();
        const runtime = toGeoGebraRuntimeConfig(
          manifest,
          import.meta.env.BASE_URL
        );
        await ensureGeoGebraScript(runtime.deployScriptUrl);

        if (disposed || !window.GGBApplet || !hostRef.current) {
          return;
        }

        const bounds = hostRef.current.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) {
          return;
        }

        const size = toAppletPixelSize(bounds);
        const applet = new window.GGBApplet(
          {
            ...toAppletConfig(profile),
            width: size.width,
            height: size.height
          },
          true
        );

        applet.setHTML5Codebase?.(runtime.html5CodebaseUrl);
        applet.inject("geogebra-container");
        const appletObject = resolveAppletObject(
          typeof applet.getAppletObject === "function"
            ? applet.getAppletObject()
            : undefined
        );
        appletObjectRef.current = appletObject;
        lastSizeRef.current = null;
        registerGeoGebraAdapter(toGeoGebraAdapter(appletObject));
        scheduleAppletResize();
        setStatus("ready");
      } catch {
        appletObjectRef.current = null;
        lastSizeRef.current = null;
        registerGeoGebraAdapter(null);
        if (!disposed) {
          setStatus("error");
        }
      }
    };

    setStatus("loading");
    void bootstrap();

    return () => {
      disposed = true;
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      appletObjectRef.current = null;
      lastSizeRef.current = null;
      registerGeoGebraAdapter(null);
    };
  }, [profile, scheduleAppletResize]);

  return (
    <section className="canvas-panel" data-panel="canvas" hidden={!visible}>
      <div ref={hostRef} className="geogebra-host" data-testid="geogebra-host">
        <div id="geogebra-container" className="geogebra-container" />
        {status === "loading" ? (
          <div className="canvas-overlay">GeoGebra 正在加载...</div>
        ) : null}
        {status === "error" ? (
          <div className="canvas-overlay canvas-overlay-error">
            GeoGebra 加载失败，请刷新页面重试
          </div>
        ) : null}
      </div>
    </section>
  );
};
