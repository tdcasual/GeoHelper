import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTemplateStore, TEMPLATE_STORE_KEY } from "./template-store";

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

describe("template-store", () => {
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

  it("loads default templates when snapshot is missing", () => {
    const store = createTemplateStore();
    const templates = store.getState().templates;

    expect(templates.length).toBeGreaterThanOrEqual(3);
    expect(templates.some((item) => item.id === "tpl_circle")).toBe(true);
  });

  it("upserts and persists template snapshot", () => {
    const store = createTemplateStore();
    const id = store.getState().upsertTemplate({
      title: "作垂直平分线",
      prompt: "过点A和B作垂直平分线",
      category: "geometry"
    });

    expect(id).toMatch(/^tpl_/);
    const persisted = JSON.parse(localStorage.getItem(TEMPLATE_STORE_KEY) ?? "{}");
    expect(
      persisted.templates.some(
        (item: { title: string }) => item.title === "作垂直平分线"
      )
    ).toBe(true);
  });

  it("removes template by id", () => {
    const store = createTemplateStore();
    store.getState().removeTemplate("tpl_circle");

    expect(store.getState().templates.some((item) => item.id === "tpl_circle")).toBe(
      false
    );
  });
});
