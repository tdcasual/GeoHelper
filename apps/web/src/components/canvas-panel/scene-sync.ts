import type { GeoGebraAdapter } from "../../geogebra/adapter";
import type { GeoGebraAppletObject } from "./runtime";

const FOCUS_SUPPRESS_MS = 160;

const normalizeObjectLabels = (objectLabels: string[]): string[] =>
  objectLabels.map((item) => item.trim()).filter(Boolean);

const clearRuntimeFocus = (appletObject: GeoGebraAppletObject | null) => {
  if (!appletObject) {
    return;
  }

  appletObject.clearFocusedObjects?.();
  appletObject.clearSelectedObjects?.();
};

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
  },
  focusObjects: (objectLabels) => {
    const labels = normalizeObjectLabels(objectLabels);
    if (labels.length === 0) {
      return false;
    }

    suppressSceneCapture(FOCUS_SUPPRESS_MS);
    if (typeof appletObject?.focusObjects === "function") {
      return appletObject.focusObjects(labels) !== false;
    }

    if (typeof appletObject?.setSelectedObject === "function") {
      clearRuntimeFocus(appletObject);
      for (const label of labels) {
        appletObject.setSelectedObject(label, true);
      }
      return true;
    }

    return false;
  },
  clearFocusedObjects: () => {
    suppressSceneCapture(FOCUS_SUPPRESS_MS);
    clearRuntimeFocus(appletObject);
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
