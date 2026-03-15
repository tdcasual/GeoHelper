import { afterEach, beforeEach } from "vitest";

import { syncChatStoreFromStorage } from "../state/chat-store";
import { syncSceneStoreFromStorage } from "../state/scene-store";
import { syncSettingsStoreFromStorage } from "../state/settings-store";
import { syncUIStoreFromStorage } from "../state/ui-store";

const resetPersistedWebState = () => {
  if (typeof localStorage !== "undefined" && typeof localStorage.clear === "function") {
    localStorage.clear();
  }

  syncSettingsStoreFromStorage();
  syncSceneStoreFromStorage();
  syncUIStoreFromStorage();
  syncChatStoreFromStorage();
};

beforeEach(() => {
  resetPersistedWebState();
});

afterEach(() => {
  resetPersistedWebState();
});
