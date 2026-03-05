import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerGeoGebraAdapter } from "../geogebra/adapter";
import { createSceneStore } from "./scene-store";

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

describe("scene-store", () => {
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
    registerGeoGebraAdapter(null);
  });

  it("records transactions and rolls back latest one", async () => {
    const evalCommands: string[] = [];
    registerGeoGebraAdapter({
      evalCommand: (cmd) => {
        evalCommands.push(cmd);
      },
      setValue: () => undefined
    });
    const store = createSceneStore();

    store.getState().recordTransaction({
      version: "1.0",
      scene_id: "s1",
      transaction_id: "t1",
      commands: [
        {
          id: "c1",
          op: "create_point",
          args: { name: "A", x: 0, y: 0 },
          depends_on: [],
          idempotency_key: "k1"
        }
      ],
      post_checks: [],
      explanations: []
    });
    store.getState().recordTransaction({
      version: "1.0",
      scene_id: "s1",
      transaction_id: "t2",
      commands: [
        {
          id: "c2",
          op: "create_point",
          args: { name: "B", x: 1, y: 1 },
          depends_on: [],
          idempotency_key: "k2"
        }
      ],
      post_checks: [],
      explanations: []
    });

    expect(store.getState().transactions.length).toBe(2);
    const rolledBack = await store.getState().rollbackLast();
    expect(rolledBack).toBe(true);
    expect(store.getState().transactions.length).toBe(1);
    expect(evalCommands).toEqual(["DeleteAll[]", "A=(0,0)"]);
  });

  it("clears scene and history", async () => {
    const evalCommands: string[] = [];
    registerGeoGebraAdapter({
      evalCommand: (cmd) => {
        evalCommands.push(cmd);
      },
      setValue: () => undefined
    });
    const store = createSceneStore();

    store.getState().recordTransaction({
      version: "1.0",
      scene_id: "s1",
      transaction_id: "t1",
      commands: [],
      post_checks: [],
      explanations: []
    });
    await store.getState().clearScene();

    expect(store.getState().transactions.length).toBe(0);
    expect(evalCommands).toContain("DeleteAll[]");
  });
});
