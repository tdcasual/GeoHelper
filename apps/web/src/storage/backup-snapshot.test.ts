import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CHAT_STORE_KEY } from "../state/chat-store";
import { SCENE_STORE_KEY } from "../state/scene-store";
import { SETTINGS_KEY } from "../state/settings-store";
import { TEMPLATE_STORE_KEY } from "../state/template-store";
import { UI_PREFS_KEY } from "../state/ui-store";
import { readCurrentPersistedAppSnapshots } from "./backup-snapshot";

const createMemoryStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    }
  };
};

describe("backup-snapshot", () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createMemoryStorage()
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage
    });
  });

  it("reads chat/settings/ui/template/scene snapshots from localStorage", () => {
    localStorage.setItem(
      CHAT_STORE_KEY,
      JSON.stringify({ conversations: [{ id: "conv_1" }] })
    );
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ schemaVersion: 3, defaultMode: "byok" })
    );
    localStorage.setItem(
      UI_PREFS_KEY,
      JSON.stringify({ chatVisible: false })
    );
    localStorage.setItem(
      TEMPLATE_STORE_KEY,
      JSON.stringify({ schemaVersion: 1, templates: [{ id: "tpl_1" }] })
    );
    localStorage.setItem(
      SCENE_STORE_KEY,
      JSON.stringify({ schemaVersion: 1, transactions: [{ id: "scene_1" }] })
    );

    expect(readCurrentPersistedAppSnapshots()).toEqual({
      chatSnapshot: {
        conversations: [{ id: "conv_1" }]
      },
      settingsSnapshot: {
        schemaVersion: 3,
        defaultMode: "byok"
      },
      uiPreferences: {
        chatVisible: false
      },
      templatesSnapshot: {
        schemaVersion: 1,
        templates: [{ id: "tpl_1" }]
      },
      sceneSnapshot: {
        schemaVersion: 1,
        transactions: [{ id: "scene_1" }]
      }
    });
  });
});
