import { useCallback, useEffect, useRef, useState } from "react";

import { GeoGebraAdapter, registerGeoGebraAdapter } from "../geogebra/adapter";
import { toAppletPixelSize } from "../geogebra/applet-size";
import {
  GeoGebraVendorManifest,
  resolveVendorAssetUrl,
  toGeoGebraRuntimeConfig
} from "../geogebra/vendor-runtime";

const GGB_MANIFEST_PATH = "/vendor/geogebra/manifest.json";

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

const resolveAppletObject = (appletObject: unknown): GeoGebraAppletObject | null => {
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

export const CanvasPanel = () => {
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

    const nextSize = toAppletPixelSize(host.getBoundingClientRect());
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

        const size = toAppletPixelSize(hostRef.current.getBoundingClientRect());
        const applet = new window.GGBApplet(
          {
            appName: "classic",
            width: size.width,
            height: size.height,
            showToolBar: true,
            showAlgebraInput: true,
            showMenuBar: true,
            showToolBarHelp: true,
            enableFileFeatures: true,
            showFullscreenButton: true,
            showResetIcon: true,
            language: "zh"
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
  }, [scheduleAppletResize]);

  return (
    <section className="canvas-panel" data-panel="canvas">
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
