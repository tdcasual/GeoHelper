import { useCallback, useEffect, useRef, useState } from "react";

import { GeoGebraAdapter, registerGeoGebraAdapter } from "../geogebra/adapter";
import { toAppletPixelSize } from "../geogebra/applet-size";
import {
  GeoGebraVendorManifest,
  resolveVendorAssetUrl,
  toGeoGebraRuntimeConfig
} from "../geogebra/vendor-runtime";
import { sceneStore } from "../state/scene-store";

const GGB_MANIFEST_PATH = "/vendor/geogebra/manifest.json";

export type CanvasUiProfile = "desktop" | "mobile";

interface CanvasPanelProps {
  profile: CanvasUiProfile;
  visible: boolean;
}

type GeoGebraListener = ((...args: unknown[]) => void) | string;

type GeoGebraAppletObject = {
  evalCommand?: (command: string) => void;
  setValue?: (name: string, value: number) => void;
  setSize?: (width: number, height: number) => void;
  recalculateEnvironments?: () => void;
  getXML?: () => string;
  setXML?: (xml: string) => void;
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

export const CanvasPanel = ({ profile, visible }: CanvasPanelProps) => {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appletObjectRef = useRef<GeoGebraAppletObject | null>(null);
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const sceneCaptureTimeoutRef = useRef<number | null>(null);
  const sceneCaptureSuppressedUntilRef = useRef(0);
  const unbindSceneListenersRef = useRef<(() => void) | null>(null);
  const readyAppletObjectRef = useRef<GeoGebraAppletObject | null>(null);
  const runtimeInitializedRef = useRef(false);
  const runtimeInitFallbackTimeoutRef = useRef<number | null>(null);

  const suppressSceneCapture = useCallback((durationMs = 280) => {
    sceneCaptureSuppressedUntilRef.current = Math.max(
      sceneCaptureSuppressedUntilRef.current,
      Date.now() + durationMs
    );
    if (sceneCaptureTimeoutRef.current !== null) {
      window.clearTimeout(sceneCaptureTimeoutRef.current);
      sceneCaptureTimeoutRef.current = null;
    }
  }, []);

  const createRuntimeAdapter = useCallback(
    (appletObject: unknown): GeoGebraAdapter => {
      const raw = resolveAppletObject(appletObject);

      return {
        evalCommand: (command) => {
          suppressSceneCapture();
          raw?.evalCommand?.(command);
        },
        setValue: (name, value) => {
          suppressSceneCapture();
          raw?.setValue?.(name, value);
        },
        getXML: () => raw?.getXML?.() ?? null,
        setXML: (xml) => {
          suppressSceneCapture(640);
          raw?.setXML?.(xml);
        }
      };
    },
    [suppressSceneCapture]
  );

  const flushSceneCapture = useCallback(() => {
    if (Date.now() < sceneCaptureSuppressedUntilRef.current) {
      return;
    }

    const xml =
      appletObjectRef.current?.getXML?.() ?? getLiveAppletObject()?.getXML?.();
    if (!xml) {
      return;
    }

    sceneStore.getState().recordSceneSnapshot(xml);
  }, []);

  const scheduleSceneCapture = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (sceneCaptureTimeoutRef.current !== null) {
      window.clearTimeout(sceneCaptureTimeoutRef.current);
    }

    sceneCaptureTimeoutRef.current = window.setTimeout(() => {
      sceneCaptureTimeoutRef.current = null;
      flushSceneCapture();
    }, 120);
  }, [flushSceneCapture]);

  const bindSceneMutationListeners = useCallback(
    (appletObject: GeoGebraAppletObject | null): (() => void) => {
      if (!appletObject) {
        return () => undefined;
      }

      const listener = () => {
        scheduleSceneCapture();
      };
      const bindings = [
        [appletObject.registerAddListener, appletObject.unregisterAddListener],
        [
          appletObject.registerUpdateListener,
          appletObject.unregisterUpdateListener
        ],
        [
          appletObject.registerRemoveListener,
          appletObject.unregisterRemoveListener
        ],
        [appletObject.registerClearListener, appletObject.unregisterClearListener],
        [
          appletObject.registerRenameListener,
          appletObject.unregisterRenameListener
        ]
      ] as const;

      for (const [register] of bindings) {
        register?.(listener);
      }

      return () => {
        for (const [, unregister] of bindings) {
          unregister?.(listener);
        }
      };
    },
    [scheduleSceneCapture]
  );


  const bindReadyRuntime = useCallback(
    (appletObject: GeoGebraAppletObject | null) => {
      if (!appletObject) {
        return null;
      }

      if (readyAppletObjectRef.current !== appletObject) {
        readyAppletObjectRef.current = appletObject;
        unbindSceneListenersRef.current?.();
        unbindSceneListenersRef.current = bindSceneMutationListeners(appletObject);
      }

      registerGeoGebraAdapter(createRuntimeAdapter(appletObject));
      return appletObject;
    },
    [bindSceneMutationListeners, createRuntimeAdapter]
  );

  const syncAppletSize = useCallback(() => {
    const host = hostRef.current;
    const appletObject = appletObjectRef.current?.setSize
      ? appletObjectRef.current
      : getLiveAppletObject();

    if (appletObject && appletObjectRef.current !== appletObject) {
      appletObjectRef.current = appletObject;
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

  const initializeReadyRuntime = useCallback(
    async (appletObject: unknown) => {
      const resolved = resolveAppletObject(appletObject);
      if (!resolved) {
        return;
      }

      appletObjectRef.current = resolved;
      lastSizeRef.current = null;
      bindReadyRuntime(resolved);

      if (!runtimeInitializedRef.current) {
        runtimeInitializedRef.current = true;
        await sceneStore.getState().rehydrateScene();
      }

      scheduleAppletResize();
      setStatus("ready");
    },
    [bindReadyRuntime, scheduleAppletResize]
  );


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
    if (typeof document === "undefined") {
      return;
    }

    const handleFullscreenChange = () => {
      const host = hostRef.current;
      const fullscreenElement = document.fullscreenElement;
      const nextIsFullscreen =
        !!host &&
        !!fullscreenElement &&
        (fullscreenElement === host || host.contains(fullscreenElement));
      setIsFullscreen(nextIsFullscreen);
      scheduleAppletResize();
      window.setTimeout(() => {
        scheduleAppletResize();
      }, 80);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [scheduleAppletResize]);

  const handleFullscreenToggle = async () => {
    if (typeof document === "undefined") {
      return;
    }

    const host = hostRef.current;
    if (!host) {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen?.();
      return;
    }

    await host.requestFullscreen?.();
  };

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
        runtimeInitializedRef.current = false;
        readyAppletObjectRef.current = null;

        const applet = new window.GGBApplet(
          {
            ...toAppletConfig(profile, (appletApi) => {
              if (disposed) {
                return;
              }
              void initializeReadyRuntime(appletApi).catch(() => {
                if (!disposed) {
                  setStatus("error");
                }
              });
            }),
            width: size.width,
            height: size.height
          },
          true
        );

        applet.setHTML5Codebase?.(runtime.html5CodebaseUrl);
        applet.inject("geogebra-container");

        const immediateAppletObject = resolveAppletObject(
          typeof applet.getAppletObject === "function"
            ? applet.getAppletObject()
            : undefined
        );
        appletObjectRef.current = immediateAppletObject;
        lastSizeRef.current = null;
        scheduleAppletResize();

        if (runtimeInitFallbackTimeoutRef.current !== null) {
          window.clearTimeout(runtimeInitFallbackTimeoutRef.current);
        }
        runtimeInitFallbackTimeoutRef.current = window.setTimeout(() => {
          runtimeInitFallbackTimeoutRef.current = null;
          if (disposed || runtimeInitializedRef.current) {
            return;
          }
          void initializeReadyRuntime(
            immediateAppletObject ?? getLiveAppletObject()
          ).catch(() => {
            if (!disposed) {
              setStatus("error");
            }
          });
        }, 1600);
      } catch {
        appletObjectRef.current = null;
        lastSizeRef.current = null;
        unbindSceneListenersRef.current?.();
        unbindSceneListenersRef.current = null;
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
      if (sceneCaptureTimeoutRef.current !== null) {
        window.clearTimeout(sceneCaptureTimeoutRef.current);
        sceneCaptureTimeoutRef.current = null;
      }
      if (runtimeInitFallbackTimeoutRef.current !== null) {
        window.clearTimeout(runtimeInitFallbackTimeoutRef.current);
        runtimeInitFallbackTimeoutRef.current = null;
      }
      runtimeInitializedRef.current = false;
      readyAppletObjectRef.current = null;
      unbindSceneListenersRef.current?.();
      unbindSceneListenersRef.current = null;
      appletObjectRef.current = null;
      lastSizeRef.current = null;
      registerGeoGebraAdapter(null);
    };
  }, [
    bindReadyRuntime,
    createRuntimeAdapter,
    initializeReadyRuntime,
    profile,
    scheduleAppletResize,
    suppressSceneCapture
  ]);

  return (
    <section className="canvas-panel" data-panel="canvas" hidden={!visible}>
      <div ref={hostRef} className="geogebra-host" data-testid="geogebra-host">
        <div id="geogebra-container" className="geogebra-container" />
        <button
          type="button"
          className="canvas-fullscreen-button"
          data-testid="canvas-fullscreen-button"
          aria-label={isFullscreen ? "退出全屏" : "全屏显示"}
          onClick={() => {
            void handleFullscreenToggle();
          }}
        >
          {isFullscreen ? "↙" : "↗"}
        </button>
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
