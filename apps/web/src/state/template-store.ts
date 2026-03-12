import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

import { persistTemplatesSnapshotToIndexedDb } from "../storage/indexed-sync";
import { notifyRemoteSyncLocalMutation } from "../storage/remote-sync";

export interface PromptTemplate {
  id: string;
  title: string;
  prompt: string;
  category: string;
  updatedAt: number;
}

interface PersistedTemplateSnapshot {
  schemaVersion: 1;
  templates: PromptTemplate[];
}

export interface TemplateStoreState extends PersistedTemplateSnapshot {
  upsertTemplate: (input: {
    id?: string;
    title: string;
    prompt: string;
    category: string;
  }) => string;
  removeTemplate: (id: string) => void;
}

export const TEMPLATE_STORE_KEY = "geohelper.templates.snapshot";

const canUseStorage = (): boolean =>
  typeof localStorage !== "undefined" &&
  typeof localStorage.getItem === "function" &&
  typeof localStorage.setItem === "function";

const makeId = (): string => `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const createDefaultTemplates = (): PromptTemplate[] => {
  const base = Date.now();
  return [
    {
      id: "tpl_circle",
      title: "画圆",
      prompt: "过点A为圆心，半径为3作圆。",
      category: "geometry",
      updatedAt: base
    },
    {
      id: "tpl_bisector",
      title: "垂直平分线",
      prompt: "过点A和B作线段AB的垂直平分线。",
      category: "geometry",
      updatedAt: base + 1
    },
    {
      id: "tpl_parabola",
      title: "抛物线",
      prompt: "绘制函数 y = x^2 - 4x + 3，并标出顶点。",
      category: "function",
      updatedAt: base + 2
    }
  ];
};

const makeDefaultSnapshot = (): PersistedTemplateSnapshot => ({
  schemaVersion: 1,
  templates: createDefaultTemplates()
});

const normalizeTemplates = (value: unknown): PromptTemplate[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : "",
      title: typeof item.title === "string" ? item.title : "",
      prompt: typeof item.prompt === "string" ? item.prompt : "",
      category: typeof item.category === "string" ? item.category : "custom",
      updatedAt:
        typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt)
          ? item.updatedAt
          : Date.now()
    }))
    .filter((item) => item.id.length > 0 && item.title.trim() && item.prompt.trim())
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

const normalizeSnapshot = (
  raw: Partial<PersistedTemplateSnapshot> | null | undefined
): PersistedTemplateSnapshot => {
  const fallback = makeDefaultSnapshot();
  const templates = normalizeTemplates(raw?.templates);
  return {
    schemaVersion: 1,
    templates: templates.length > 0 ? templates : fallback.templates
  };
};

const loadSnapshot = (): PersistedTemplateSnapshot => {
  if (!canUseStorage()) {
    return makeDefaultSnapshot();
  }

  try {
    const raw = localStorage.getItem(TEMPLATE_STORE_KEY);
    if (!raw) {
      return makeDefaultSnapshot();
    }
    return normalizeSnapshot(JSON.parse(raw) as Partial<PersistedTemplateSnapshot>);
  } catch {
    return makeDefaultSnapshot();
  }
};

const persistSnapshot = (snapshot: PersistedTemplateSnapshot): void => {
  if (!canUseStorage()) {
    return;
  }

  localStorage.setItem(TEMPLATE_STORE_KEY, JSON.stringify(snapshot));
  void persistTemplatesSnapshotToIndexedDb(
    snapshot as unknown as Record<string, unknown>
  );
  notifyRemoteSyncLocalMutation();
};

export const createTemplateStore = () => {
  const initial = loadSnapshot();

  return createStore<TemplateStoreState>((set) => ({
    ...initial,
    upsertTemplate: (input) => {
      const id = input.id ?? `tpl_${makeId()}`;
      set((state) => {
        const updated: PromptTemplate = {
          id,
          title: input.title.trim() || "未命名模板",
          prompt: input.prompt.trim(),
          category: input.category.trim() || "custom",
          updatedAt: Date.now()
        };
        const templates = [updated, ...state.templates.filter((item) => item.id !== id)].sort(
          (a, b) => b.updatedAt - a.updatedAt
        );
        persistSnapshot({
          schemaVersion: 1,
          templates
        });
        return {
          templates
        };
      });
      return id;
    },
    removeTemplate: (id) =>
      set((state) => {
        const templates = state.templates.filter((item) => item.id !== id);
        persistSnapshot({
          schemaVersion: 1,
          templates
        });
        return {
          templates
        };
      })
  }));
};

export const templateStore = createTemplateStore();

const applyTemplateSnapshotToStore = (
  store: ReturnType<typeof createTemplateStore>,
  snapshot: PersistedTemplateSnapshot
): PersistedTemplateSnapshot => {
  store.setState(() => ({
    schemaVersion: snapshot.schemaVersion,
    templates: snapshot.templates
  }));
  return snapshot;
};

export const syncTemplateStoreFromStorage = (
  store: ReturnType<typeof createTemplateStore> = templateStore
): PersistedTemplateSnapshot => applyTemplateSnapshotToStore(store, loadSnapshot());

export const useTemplateStore = <T>(
  selector: (state: TemplateStoreState) => T
): T => useStore(templateStore, selector);
