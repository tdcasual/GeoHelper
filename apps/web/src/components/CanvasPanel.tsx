import { useCallback, useEffect, useRef, useState } from "react";

import { getGeoGebraAdapter, registerGeoGebraAdapter } from "../geogebra/adapter";
import { toAppletPixelSize } from "../geogebra/applet-size";
import { executeBatch as executeGeoGebraCommandBatch } from "../geogebra/command-executor";
import { toGeoGebraRuntimeConfig } from "../geogebra/vendor-runtime";
import { registerCanvasBridgeBindings } from "../runtime/browser-bridge";
import { useSceneFocusStore } from "../state/scene-focus-store";
import { sceneStore } from "../state/scene-store";
import { type CanvasFocusNotice,CanvasPanelFrame } from "./canvas-panel/CanvasPanelFrame";
import { type CanvasUiProfile, ensureGeoGebraScript, type GeoGebraAppletObject, getLiveAppletObject, loadGeoGebraManifest, resolveAppletObject, toAppletConfig } from "./canvas-panel/runtime";
import { bindGeoGebraSceneListeners, createRuntimeAdapter, createSceneCaptureController } from "./canvas-panel/scene-sync";

interface CanvasPanelProps {
  profile: CanvasUiProfile;
  visible: boolean;
  focusNotice?: CanvasFocusNotice | null;
}

export const CanvasPanel = ({ profile, visible, focusNotice }: CanvasPanelProps) => {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const focusRequest = useSceneFocusStore((state) => state.focusRequest);
  const consumeFocusRequest = useSceneFocusStore((state) => state.consumeFocusRequest);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appletObjectRef = useRef<GeoGebraAppletObject | null>(null);
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const sceneCaptureTimeoutRef = useRef<number | null>(null);
  const unbindSceneListenersRef = useRef<(() => void) | null>(null);
  const readyAppletObjectRef = useRef<GeoGebraAppletObject | null>(null);
  const runtimeInitializedRef = useRef(false);
  const runtimeInitFallbackTimeoutRef = useRef<number | null>(null);
  const sceneCaptureControllerRef = useRef(
    createSceneCaptureController(
      () => appletObjectRef.current?.getXML?.() ?? getLiveAppletObject()?.getXML?.() ?? null,
      (xml) => {
        sceneStore.getState().recordSceneSnapshot(xml);
      }
    )
  );
  const suppressSceneCapture = useCallback((durationMs = 280) => {
    sceneCaptureControllerRef.current.suppress(durationMs);
    if (sceneCaptureTimeoutRef.current !== null) {
      window.clearTimeout(sceneCaptureTimeoutRef.current);
      sceneCaptureTimeoutRef.current = null;
    }
  }, []);

  const flushSceneCapture = useCallback(() => {
    sceneCaptureControllerRef.current.flushNow();
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

  const bindReadyRuntime = useCallback(
    (appletObject: GeoGebraAppletObject | null) => {
      if (!appletObject) {
        return null;
      }
      if (readyAppletObjectRef.current !== appletObject) {
        readyAppletObjectRef.current = appletObject;
        unbindSceneListenersRef.current?.();
        unbindSceneListenersRef.current = bindGeoGebraSceneListeners(
          appletObject,
          scheduleSceneCapture
        );
      }

      registerGeoGebraAdapter(
        createRuntimeAdapter(appletObject, suppressSceneCapture)
      );
      registerCanvasBridgeBindings({
        executeBatch: executeGeoGebraCommandBatch,
        getSceneXml: () => appletObject.getXML?.() ?? null
      });
      return appletObject;
    },
    [scheduleSceneCapture, suppressSceneCapture]
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
    return () => {
      registerCanvasBridgeBindings(null);
    };
  }, []);

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
    if (status !== "ready" || !focusRequest) {
      return;
    }

    const adapter = getGeoGebraAdapter();
    adapter.clearFocusedObjects?.();
    adapter.focusObjects?.(focusRequest.objectLabels);
    consumeFocusRequest(focusRequest.requestId);
  }, [consumeFocusRequest, focusRequest, status]);

  useEffect(() => {
    let disposed = false;

    const bootstrap = async () => {
      try {
        const runtime = toGeoGebraRuntimeConfig(
          await loadGeoGebraManifest(import.meta.env.BASE_URL),
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
  }, [initializeReadyRuntime, profile, scheduleAppletResize]);

  return <CanvasPanelFrame hostRef={hostRef} visible={visible} status={status} focusNotice={focusNotice} isFullscreen={isFullscreen} onFullscreenToggle={() => {
    void handleFullscreenToggle();
  }} />;
};
