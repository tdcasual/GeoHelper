import type { Page } from "@playwright/test";

export const mockGeoGebraRuntime = async (page: Page) => {
  await page.route("**/vendor/geogebra/manifest.json", (route) =>
    route.fulfill({
      json: {
        deployScriptPath: "/vendor/geogebra/current/deployggb.js",
        html5CodebasePath: "/vendor/geogebra/current/HTML5/5.0/web3d/"
      }
    })
  );

  await page.route("**/vendor/geogebra/current/deployggb.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: ""
    })
  );

  await page.addInitScript(() => {
    type Listener = ((...args: unknown[]) => void) | string;
    type ListenerMap = Record<"add" | "update" | "remove" | "clear" | "rename", Listener[]>;
    type GeoGebraTestWindow = Window &
      typeof globalThis & {
        GGBApplet?: unknown;
        ggbApplet?: unknown;
        __geohelperGgbSizeCalls: Array<{ width: number; height: number }>;
        __geohelperGgbRecalculateCount: number;
        __geohelperGgbInjectedTo: string[];
        __geohelperGgbParamsHistory: Record<string, unknown>[];
        __geohelperGgbEvalCommands: string[];
        __geohelperGgbSetXmlCalls: string[];
        __geohelperGgbFocusCalls: string[][];
        __geohelperGgbClearFocusCount: number;
        __geohelperGgbCurrentXml: string;
        __geohelperGgbAppletOnLoadCalls: number;
        __geohelperGgbListenerHistory: ListenerMap[];
        __geohelperGgbActiveListeners?: ListenerMap;
        __geohelperGgbCodebase?: string;
        __geohelperGgbParams?: Record<string, unknown>;
        __geohelperEmitSceneMutation?: (
          eventType: "add" | "update" | "remove" | "clear" | "rename",
          payload?: unknown,
          nextXml?: string
        ) => void;
      };
    const testWindow = window as GeoGebraTestWindow;

    const runListener = (listener: Listener, ...args: unknown[]) => {
      if (typeof listener === "function") {
        listener(...args);
        return;
      }

      const globalFn = testWindow[listener as keyof GeoGebraTestWindow];
      if (typeof globalFn === "function") {
        (globalFn as (...innerArgs: unknown[]) => void)(...args);
      }
    };

    const removeListener = (listeners: Listener[], target: Listener) => {
      const index = listeners.indexOf(target);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    };

    testWindow.__geohelperGgbSizeCalls = [];
    testWindow.__geohelperGgbRecalculateCount = 0;
    testWindow.__geohelperGgbInjectedTo = [];
    testWindow.__geohelperGgbParamsHistory = [];
    testWindow.__geohelperGgbEvalCommands = [];
    testWindow.__geohelperGgbSetXmlCalls = [];
    testWindow.__geohelperGgbFocusCalls = [];
    testWindow.__geohelperGgbClearFocusCount = 0;
    testWindow.__geohelperGgbCurrentXml = "<xml/>";
    testWindow.__geohelperGgbAppletOnLoadCalls = 0;
    testWindow.__geohelperGgbListenerHistory = [];
    testWindow.__geohelperEmitSceneMutation =
      (
        eventType: "add" | "update" | "remove" | "clear" | "rename",
        payload?: unknown,
        nextXml?: string
      ) => {
        const listenerSet = testWindow.__geohelperGgbActiveListeners;
        if (!listenerSet) {
          return;
        }
        if (typeof nextXml === "string") {
          testWindow.__geohelperGgbCurrentXml = nextXml;
        }
        for (const listener of listenerSet[eventType] ?? []) {
          if (eventType === "rename" && Array.isArray(payload)) {
            runListener(listener, ...payload);
          } else if (typeof payload !== "undefined") {
            runListener(listener, payload);
          } else {
            runListener(listener);
          }
        }
      };

    testWindow.GGBApplet = function GGBApplet(params: Record<string, unknown>) {
      testWindow.__geohelperGgbParams = params;
      testWindow.__geohelperGgbParamsHistory.push(params);

      const listeners: ListenerMap = {
        add: [],
        update: [],
        remove: [],
        clear: [],
        rename: []
      };
      testWindow.__geohelperGgbActiveListeners = listeners;
      testWindow.__geohelperGgbListenerHistory.push(listeners);

      const appletObject = {
        evalCommand: (command: string) => {
          testWindow.__geohelperGgbEvalCommands.push(command);
        },
        setValue: () => undefined,
        setSize: (width: number, height: number) => {
          testWindow.__geohelperGgbSizeCalls.push({ width, height });
        },
        recalculateEnvironments: () => {
          testWindow.__geohelperGgbRecalculateCount += 1;
        },
        getXML: () => testWindow.__geohelperGgbCurrentXml,
        setXML: (xml: string) => {
          testWindow.__geohelperGgbCurrentXml = xml;
          testWindow.__geohelperGgbSetXmlCalls.push(xml);
        },
        focusObjects: (objectLabels: string[]) => {
          testWindow.__geohelperGgbFocusCalls.push([...objectLabels]);
          return true;
        },
        clearFocusedObjects: () => {
          testWindow.__geohelperGgbClearFocusCount += 1;
        },
        registerAddListener: (listener: Listener) => {
          listeners.add.push(listener);
        },
        unregisterAddListener: (listener: Listener) => {
          removeListener(listeners.add, listener);
        },
        registerUpdateListener: (listener: Listener) => {
          listeners.update.push(listener);
        },
        unregisterUpdateListener: (listener: Listener) => {
          removeListener(listeners.update, listener);
        },
        registerRemoveListener: (listener: Listener) => {
          listeners.remove.push(listener);
        },
        unregisterRemoveListener: (listener: Listener) => {
          removeListener(listeners.remove, listener);
        },
        registerClearListener: (listener: Listener) => {
          listeners.clear.push(listener);
        },
        unregisterClearListener: (listener: Listener) => {
          removeListener(listeners.clear, listener);
        },
        registerRenameListener: (listener: Listener) => {
          listeners.rename.push(listener);
        },
        unregisterRenameListener: (listener: Listener) => {
          removeListener(listeners.rename, listener);
        }
      };

      return {
        inject: (containerId: string) => {
          testWindow.__geohelperGgbInjectedTo.push(containerId);
          testWindow.ggbApplet = appletObject;
          if (typeof params.appletOnLoad === "function") {
            params.appletOnLoad(appletObject);
            testWindow.__geohelperGgbAppletOnLoadCalls += 1;
          }
        },
        setHTML5Codebase: (codebase: string) => {
          testWindow.__geohelperGgbCodebase = codebase;
        },
        getAppletObject: () => appletObject
      };
    };
  });
};
