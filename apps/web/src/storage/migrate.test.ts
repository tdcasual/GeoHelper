import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "./migrate";

const CHAT_STORE_KEY = "geohelper.chat.snapshot";
const SETTINGS_KEY = "geohelper.settings.snapshot";
const UI_PREFS_KEY = "geohelper.ui.preferences";
const TEMPLATE_STORE_KEY = "geohelper.templates.snapshot";
const MIGRATION_VERSION_KEY = "geohelper.storage.migration.version";

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

describe("migrate", () => {
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

  it("normalizes legacy snapshots and marks migration version", async () => {
    localStorage.setItem(
      CHAT_STORE_KEY,
      JSON.stringify({
        mode: "byok",
        messages: [{ id: "m1", role: "user", content: "legacy" }]
      })
    );
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        defaultMode: "official",
        byokPresets: [{ id: "b1", name: "B1" }],
        officialPresets: [{ id: "o1", name: "O1" }]
      })
    );
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify({}));
    localStorage.setItem(
      TEMPLATE_STORE_KEY,
      JSON.stringify({
        templates: [{ id: "tpl_1", title: "圆", prompt: "画一个圆" }]
      })
    );

    await runMigrations();

    const chatSnapshot = JSON.parse(localStorage.getItem(CHAT_STORE_KEY) ?? "{}");
    const settingsSnapshot = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
    const uiSnapshot = JSON.parse(localStorage.getItem(UI_PREFS_KEY) ?? "{}");
    const templateSnapshot = JSON.parse(
      localStorage.getItem(TEMPLATE_STORE_KEY) ?? "{}"
    );

    expect(chatSnapshot.conversations.length).toBe(1);
    expect(chatSnapshot.activeConversationId).toBe(chatSnapshot.conversations[0].id);
    expect(chatSnapshot.messages[0].content).toBe("legacy");
    expect(settingsSnapshot.schemaVersion).toBe(3);
    expect(settingsSnapshot.defaultMode).toBe("official");
    expect(Array.isArray(settingsSnapshot.runtimeProfiles)).toBe(true);
    expect(typeof settingsSnapshot.defaultRuntimeProfileId).toBe("string");
    expect(uiSnapshot.chatVisible).toBe(true);
    expect(templateSnapshot.schemaVersion).toBe(1);
    expect(templateSnapshot.templates[0].id).toBe("tpl_1");
    expect(localStorage.getItem(MIGRATION_VERSION_KEY)).toBe("1");
  });

  it("removes invalid json snapshots during migration", async () => {
    localStorage.setItem(CHAT_STORE_KEY, "{invalid");
    localStorage.setItem(SETTINGS_KEY, "{invalid");
    localStorage.setItem(UI_PREFS_KEY, "{invalid");
    localStorage.setItem(TEMPLATE_STORE_KEY, "{invalid");

    await runMigrations();

    expect(localStorage.getItem(CHAT_STORE_KEY)).toBeNull();
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
    expect(localStorage.getItem(UI_PREFS_KEY)).toBeNull();
    expect(localStorage.getItem(TEMPLATE_STORE_KEY)).toBeNull();
    expect(localStorage.getItem(MIGRATION_VERSION_KEY)).toBe("1");
  });
});
