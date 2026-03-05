import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  exportBackup,
  exportCurrentAppBackup,
  importAppBackupToLocalStorage,
  importBackup
} from "./backup";
import { CHAT_STORE_KEY } from "../state/chat-store";
import { SETTINGS_KEY } from "../state/settings-store";
import { UI_PREFS_KEY } from "../state/ui-store";

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

describe("backup", () => {
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

  it("round-trips conversations and settings", async () => {
    const blob = await exportBackup({
      conversations: [{ id: "c1" }],
      settings: { chatVisible: false }
    });
    const restored = await importBackup(blob);

    expect(restored.conversations[0].id).toBe("c1");
    expect(restored.settings.chatVisible).toBe(false);
  });

  it("exports and restores local snapshots", async () => {
    localStorage.setItem(
      CHAT_STORE_KEY,
      JSON.stringify({
        mode: "byok",
        conversations: [{ id: "conv_1", messages: [] }]
      })
    );
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        schemaVersion: 2,
        defaultMode: "byok",
        byokPresets: [],
        officialPresets: []
      })
    );
    localStorage.setItem(
      UI_PREFS_KEY,
      JSON.stringify({
        chatVisible: false
      })
    );

    const blob = await exportCurrentAppBackup();
    localStorage.removeItem(CHAT_STORE_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(UI_PREFS_KEY);

    await importAppBackupToLocalStorage(blob);

    const chatSnapshot = JSON.parse(localStorage.getItem(CHAT_STORE_KEY) ?? "{}");
    const settingsSnapshot = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) ?? "{}"
    );
    const uiPreferences = JSON.parse(localStorage.getItem(UI_PREFS_KEY) ?? "{}");

    expect(chatSnapshot.conversations[0].id).toBe("conv_1");
    expect(settingsSnapshot.schemaVersion).toBe(2);
    expect(uiPreferences.chatVisible).toBe(false);
  });
});
