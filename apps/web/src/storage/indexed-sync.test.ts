import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  persistChatSnapshotToIndexedDb,
  persistSceneSnapshotToIndexedDb,
  persistSettingsSnapshotToIndexedDb,
  persistUiPrefsToIndexedDb,
  syncLocalSnapshotsWithIndexedDb
} from "./indexed-sync";

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
  });
});
