import { useEffect, useState } from "react";

import { GeoGebraAdapter, registerGeoGebraAdapter } from "../geogebra/adapter";

const GGB_SCRIPT_URL = "https://www.geogebra.org/apps/deployggb.js";

let ggbLoaderPromise: Promise<void> | null = null;

const ensureGeoGebraScript = async (): Promise<void> => {
  if (typeof window === "undefined") {
    throw new Error("window is unavailable");
  }

  if (window.GGBApplet) {
    return;
  }

  if (!ggbLoaderPromise) {
    ggbLoaderPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GGB_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load GeoGebra script"));
      document.head.appendChild(script);
    });
  }

  await ggbLoaderPromise;
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
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let disposed = false;

    const bootstrap = async () => {
      try {
        await ensureGeoGebraScript();
        if (disposed || !window.GGBApplet) {
          return;
        }

        const applet = new window.GGBApplet(
          {
            appName: "classic",
            width: "100%",
            height: "100%",
            showToolBar: true,
            showAlgebraInput: true,
            showMenuBar: false,
            showResetIcon: true,
            language: "zh",
            scaleContainerClass: "geogebra-host"
          },
          true
        );
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

    bootstrap();

    return () => {
      disposed = true;
      registerGeoGebraAdapter(null);
    };
  }, []);

  return (
    <section className="canvas-panel" data-panel="canvas">
      <div className="geogebra-host" data-testid="geogebra-host">
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
