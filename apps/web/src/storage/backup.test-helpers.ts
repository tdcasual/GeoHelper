import { afterEach, beforeEach } from "vitest";

import { registerGeoGebraAdapter } from "../geogebra/adapter";
import { chatStore } from "../state/chat-store";
import { sceneStore } from "../state/scene-store";
import { settingsStore } from "../state/settings-store";
import { uiStore } from "../state/ui-store";

export const TEMPLATE_STORE_KEY = "geohelper.templates.snapshot";

const initialSettingsState = settingsStore.getState();

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

const resetBackupStores = () => {
  chatStore.setState({
    mode: "byok",
    sessionToken: null,
    conversations: [
      {
        id: "conv_local",
        title: "Local",
        createdAt: 1,
        updatedAt: 1,
        messages: []
      }
    ],
    activeConversationId: "conv_local",
    messages: [],
    isSending: false,
    reauthRequired: false
  });
  sceneStore.setState({
    schemaVersion: 1,
    transactions: [],
    isRollingBack: false
  });
  settingsStore.setState(() => initialSettingsState);
  uiStore.setState({
    chatVisible: true,
    historyDrawerVisible: false,
    historyDrawerWidth: 280
  });
};

export const setupBackupTestEnvironment = () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createMemoryStorage()
    });
    resetBackupStores();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage
    });
    settingsStore.setState(() => initialSettingsState);
    registerGeoGebraAdapter(null);
  });
};
