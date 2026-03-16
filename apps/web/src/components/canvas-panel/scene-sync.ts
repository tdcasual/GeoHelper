import type { GeoGebraAdapter } from "../../geogebra/adapter";
import type { GeoGebraAppletObject } from "./runtime";

export const createSceneCaptureController = (
  readXml: () => string | null,
  onCapture?: (xml: string) => void
) => {
  let suppressedUntil = 0;

  const controller = {
    suppress: (durationMs = 280) => {
      suppressedUntil = Math.max(suppressedUntil, Date.now() + durationMs);
    },
    canFlushAt: (timestamp: number) => timestamp >= suppressedUntil,
    flushNow: (timestamp = Date.now()) => {
      if (!controller.canFlushAt(timestamp)) {
        return null;
      }

      const xml = readXml();
      if (!xml) {
        return null;
      }

      onCapture?.(xml);
      return xml;
    }
  };

  return controller;
};

export const createRuntimeAdapter = (
  appletObject: GeoGebraAppletObject | null,
  suppressSceneCapture: (durationMs?: number) => void
): GeoGebraAdapter => ({
  evalCommand: (command) => {
    suppressSceneCapture();
    appletObject?.evalCommand?.(command);
  },
  setValue: (name, value) => {
    suppressSceneCapture();
    appletObject?.setValue?.(name, value);
  },
  getXML: () => appletObject?.getXML?.() ?? null,
  setXML: (xml) => {
    suppressSceneCapture(640);
    appletObject?.setXML?.(xml);
  }
});

export const bindGeoGebraSceneListeners = (
  appletObject: GeoGebraAppletObject | null,
  onChange: () => void
): (() => void) => {
  if (!appletObject) {
    return () => undefined;
  }

  const bindings = [
    [appletObject.registerAddListener, appletObject.unregisterAddListener],
    [appletObject.registerUpdateListener, appletObject.unregisterUpdateListener],
    [appletObject.registerRemoveListener, appletObject.unregisterRemoveListener],
    [appletObject.registerClearListener, appletObject.unregisterClearListener],
    [appletObject.registerRenameListener, appletObject.unregisterRenameListener]
  ] as const;

  for (const [register] of bindings) {
    register?.(onChange);
  }

  return () => {
    for (const [, unregister] of bindings) {
      unregister?.(onChange);
    }
  };
};
