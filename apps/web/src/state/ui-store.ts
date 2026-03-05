import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

export interface UIState {
  chatVisible: boolean;
  toggleChat: () => void;
  setChatVisible: (value: boolean) => void;
}

export const UI_PREFS_KEY = "geohelper.ui.preferences";
const canUseStorage = (): boolean =>
  typeof localStorage !== "undefined" &&
  typeof localStorage.getItem === "function" &&
  typeof localStorage.setItem === "function";

const loadInitialChatVisible = (): boolean => {
  if (!canUseStorage()) {
    return true;
  }

  try {
    const raw = localStorage.getItem(UI_PREFS_KEY);
    if (!raw) {
      return true;
    }

    const parsed = JSON.parse(raw) as { chatVisible?: boolean };
    return parsed.chatVisible ?? true;
  } catch {
    return true;
  }
};

const persistChatVisible = (chatVisible: boolean): void => {
  if (!canUseStorage()) {
    return;
  }

  localStorage.setItem(
    UI_PREFS_KEY,
    JSON.stringify({
      chatVisible
    })
  );
};

export const createUIStore = () =>
  createStore<UIState>((set) => ({
    chatVisible: loadInitialChatVisible(),
    toggleChat: () =>
      set((state) => {
        const chatVisible = !state.chatVisible;
        persistChatVisible(chatVisible);
        return {
          chatVisible
        };
      }),
    setChatVisible: (value) =>
      set(() => {
        persistChatVisible(value);
        return {
          chatVisible: value
        };
      })
  }));

export const uiStore = createUIStore();

export const useUIStore = <T>(selector: (state: UIState) => T): T =>
  useStore(uiStore, selector);
