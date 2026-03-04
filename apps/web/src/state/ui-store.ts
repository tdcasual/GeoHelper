import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

export interface UIState {
  chatVisible: boolean;
  toggleChat: () => void;
  setChatVisible: (value: boolean) => void;
}

export const createUIStore = () =>
  createStore<UIState>((set) => ({
    chatVisible: true,
    toggleChat: () =>
      set((state) => ({
        chatVisible: !state.chatVisible
      })),
    setChatVisible: (value) =>
      set({
        chatVisible: value
      })
  }));

export const uiStore = createUIStore();

export const useUIStore = <T>(selector: (state: UIState) => T): T =>
  useStore(uiStore, selector);
