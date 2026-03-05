import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  persistChatSnapshotToIndexedDb,
  persistSceneSnapshotToIndexedDb,
  persistSettingsSnapshotToIndexedDb,
  persistTemplatesSnapshotToIndexedDb,
  persistUiPrefsToIndexedDb,
  syncLocalSnapshotsWithIndexedDb
} from "./indexed-sync";

interface SettingRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}

const dbSettings = vi.hoisted(() => new Map<string, SettingRecord>());

vi.mock("./db", () => ({
  db: {
    settings: {
      get: async (key: string): Promise<SettingRecord | undefined> =>
        dbSettings.get(key),
      put: async (entry: SettingRecord): Promise<void> => {
        dbSettings.set(entry.key, entry);
      }
    }
  }
}));

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

describe("indexed-sync", () => {
  const originalLocalStorage = globalThis.localStorage;
  const originalIndexedDb = globalThis.indexedDB;

  beforeEach(() => {
    dbSettings.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createMemoryStorage()
    });
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: undefined
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage
    });
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: originalIndexedDb
    });
  });

  it("does not throw when indexeddb is unavailable", async () => {
    localStorage.setItem(
      "geohelper.chat.snapshot",
      JSON.stringify({
        mode: "byok",
        conversations: []
      })
    );

    await expect(syncLocalSnapshotsWithIndexedDb()).resolves.toBeUndefined();
    await expect(
      persistChatSnapshotToIndexedDb({ mode: "byok", conversations: [] })
    ).resolves.toBeUndefined();
    await expect(
      persistSettingsSnapshotToIndexedDb({ schemaVersion: 2 })
    ).resolves.toBeUndefined();
    await expect(
      persistUiPrefsToIndexedDb({ chatVisible: true })
    ).resolves.toBeUndefined();
    await expect(
      persistSceneSnapshotToIndexedDb({ transactions: [] })
    ).resolves.toBeUndefined();
    await expect(
      persistTemplatesSnapshotToIndexedDb({ templates: [] })
    ).resolves.toBeUndefined();
  });

  it("hydrates local snapshots from indexeddb when available", async () => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {}
    });
    dbSettings.set("snapshot.chat", {
      key: "snapshot.chat",
      value: {
        mode: "byok",
        conversations: [{ id: "conv_1", messages: [] }]
      },
      updatedAt: "2026-03-05T00:00:00.000Z"
    });
    dbSettings.set("snapshot.templates", {
      key: "snapshot.templates",
      value: {
        schemaVersion: 1,
        templates: [{ id: "tpl_1", title: "圆", prompt: "画一个圆", updatedAt: 1 }]
      },
      updatedAt: "2026-03-05T00:00:00.000Z"
    });

    await syncLocalSnapshotsWithIndexedDb();

    const chat = JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "{}");
    const templates = JSON.parse(
      localStorage.getItem("geohelper.templates.snapshot") ?? "{}"
    );
    expect(chat.conversations[0].id).toBe("conv_1");
    expect(templates.templates[0].id).toBe("tpl_1");
  });

  it("backfills indexeddb from local snapshots when db snapshot is missing", async () => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {}
    });
    localStorage.setItem(
      "geohelper.chat.snapshot",
      JSON.stringify({
        mode: "byok",
        conversations: [{ id: "conv_local", messages: [] }]
      })
    );

    await syncLocalSnapshotsWithIndexedDb();

    const chatRecord = dbSettings.get("snapshot.chat");
    expect(
      (chatRecord?.value as { conversations?: Array<{ id: string }> })?.conversations?.[0]
        ?.id
    ).toBe("conv_local");
  });
});
