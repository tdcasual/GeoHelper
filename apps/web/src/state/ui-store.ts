import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { persistUiPrefsToIndexedDb } from "../storage/indexed-sync";

export interface UIState {
  chatVisible: boolean;
  historyDrawerVisible: boolean;
  historyDrawerWidth: number;
  toggleChat: () => void;
  setChatVisible: (value: boolean) => void;
  toggleHistoryDrawer: () => void;
  setHistoryDrawerVisible: (value: boolean) => void;
  setHistoryDrawerWidth: (value: number) => void;
}

export const UI_PREFS_KEY = "geohelper.ui.preferences";
const DEFAULT_CHAT_VISIBLE = true;
const DEFAULT_HISTORY_VISIBLE = false;
const DEFAULT_HISTORY_WIDTH = 280;
const MIN_HISTORY_WIDTH = 189;
const MAX_HISTORY_WIDTH = 420;
const canUseStorage = (): boolean =>
  typeof localStorage !== "undefined" &&
  typeof localStorage.getItem === "function" &&
  typeof localStorage.setItem === "function";

interface UiSnapshot {
  chatVisible: boolean;
  historyDrawerVisible: boolean;
  historyDrawerWidth: number;
}

const clampHistoryWidth = (value: number): number =>
  Math.min(MAX_HISTORY_WIDTH, Math.max(MIN_HISTORY_WIDTH, value));

const loadInitialSnapshot = (): UiSnapshot => {
  if (!canUseStorage()) {
    return {
      chatVisible: DEFAULT_CHAT_VISIBLE,
      historyDrawerVisible: DEFAULT_HISTORY_VISIBLE,
      historyDrawerWidth: DEFAULT_HISTORY_WIDTH
    };
  }

  try {
    const raw = localStorage.getItem(UI_PREFS_KEY);
    if (!raw) {
      return {
        chatVisible: DEFAULT_CHAT_VISIBLE,
        historyDrawerVisible: DEFAULT_HISTORY_VISIBLE,
        historyDrawerWidth: DEFAULT_HISTORY_WIDTH
      };
    }

    const parsed = JSON.parse(raw) as {
      chatVisible?: boolean;
      historyDrawerVisible?: boolean;
      historyDrawerWidth?: number;
    };
    return {
      chatVisible: parsed.chatVisible ?? DEFAULT_CHAT_VISIBLE,
      historyDrawerVisible:
        parsed.historyDrawerVisible ?? DEFAULT_HISTORY_VISIBLE,
      historyDrawerWidth: clampHistoryWidth(
        parsed.historyDrawerWidth ?? DEFAULT_HISTORY_WIDTH
      )
    };
  } catch {
    return {
      chatVisible: DEFAULT_CHAT_VISIBLE,
      historyDrawerVisible: DEFAULT_HISTORY_VISIBLE,
      historyDrawerWidth: DEFAULT_HISTORY_WIDTH
    };
  }
};

const persistUiSnapshot = (snapshot: UiSnapshot): void => {
  if (!canUseStorage()) {
    return;
  }

  localStorage.setItem(UI_PREFS_KEY, JSON.stringify(snapshot));
  void persistUiPrefsToIndexedDb(snapshot as unknown as Record<string, unknown>);
};

export const createUIStore = () =>
  createStore<UIState>((set) => {
    const initial = loadInitialSnapshot();
    return {
      chatVisible: initial.chatVisible,
      historyDrawerVisible: initial.historyDrawerVisible,
      historyDrawerWidth: initial.historyDrawerWidth,
    toggleChat: () =>
      set((state) => {
        const chatVisible = !state.chatVisible;
        persistUiSnapshot({
          chatVisible,
          historyDrawerVisible: state.historyDrawerVisible,
          historyDrawerWidth: state.historyDrawerWidth
        });
        return {
          chatVisible
        };
      }),
    setChatVisible: (value) =>
      set((state) => {
        persistUiSnapshot({
          chatVisible: value,
          historyDrawerVisible: state.historyDrawerVisible,
          historyDrawerWidth: state.historyDrawerWidth
        });
        return {
          chatVisible: value
        };
      }),
      toggleHistoryDrawer: () =>
        set((state) => {
          const historyDrawerVisible = !state.historyDrawerVisible;
          persistUiSnapshot({
            chatVisible: state.chatVisible,
            historyDrawerVisible,
            historyDrawerWidth: state.historyDrawerWidth
          });
          return {
            historyDrawerVisible
          };
        }),
      setHistoryDrawerVisible: (value) =>
        set((state) => {
          persistUiSnapshot({
            chatVisible: state.chatVisible,
            historyDrawerVisible: value,
            historyDrawerWidth: state.historyDrawerWidth
          });
          return {
            historyDrawerVisible: value
          };
        }),
      setHistoryDrawerWidth: (value) =>
        set((state) => {
          const historyDrawerWidth = clampHistoryWidth(value);
          persistUiSnapshot({
            chatVisible: state.chatVisible,
            historyDrawerVisible: state.historyDrawerVisible,
            historyDrawerWidth
          });
          return {
            historyDrawerWidth
          };
        })
  };
  });

export const uiStore = createUIStore();

const applyUiSnapshotToStore = (
  store: ReturnType<typeof createUIStore>,
  snapshot: UiSnapshot
): UiSnapshot => {
  store.setState(() => ({
    chatVisible: snapshot.chatVisible,
    historyDrawerVisible: snapshot.historyDrawerVisible,
    historyDrawerWidth: snapshot.historyDrawerWidth
  }));
  return snapshot;
};

export const syncUIStoreFromStorage = (
  store: ReturnType<typeof createUIStore> = uiStore
): UiSnapshot => applyUiSnapshotToStore(store, loadInitialSnapshot());

export const useUIStore = <T>(selector: (state: UIState) => T): T =>
  useStore(uiStore, selector);
