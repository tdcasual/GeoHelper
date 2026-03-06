import { useEffect, useRef, useState } from "react";

import { GeoGebraAdapter, registerGeoGebraAdapter } from "../geogebra/adapter";
import { toAppletPixelSize } from "../geogebra/applet-size";
import {
  GeoGebraVendorManifest,
  resolveVendorAssetUrl,
  toGeoGebraRuntimeConfig
} from "../geogebra/vendor-runtime";

const GGB_MANIFEST_PATH = "/vendor/geogebra/manifest.json";

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

const toGeoGebraAdapter = (appletObject: unknown): GeoGebraAdapter => {
  const raw = appletObject as
    | {
        evalCommand?: (command: string) => void;
        setValue?: (name: string, value: number) => void;
      }
    | null
    | undefined;

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
            showMenuBar: false,
            showResetIcon: true,
            language: "zh"
          },
          true
        );

        applet.setHTML5Codebase?.(runtime.html5CodebaseUrl);
        applet.inject("geogebra-container");
        const appletObject =
          typeof applet.getAppletObject === "function"
            ? applet.getAppletObject()
            : undefined;
        registerGeoGebraAdapter(toGeoGebraAdapter(appletObject));
        setStatus("ready");
      } catch {
        registerGeoGebraAdapter(null);
        if (!disposed) {
          setStatus("error");
        }
      }
    };

    void bootstrap();

    return () => {
      disposed = true;
      registerGeoGebraAdapter(null);
    };
  }, []);

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
