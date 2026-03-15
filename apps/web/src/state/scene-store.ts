import { CommandBatch } from "@geohelper/protocol";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { getGeoGebraAdapter } from "../geogebra/adapter";
import { executeBatchWithAdapter } from "../geogebra/command-executor";
import { persistSceneSnapshotToIndexedDb } from "../storage/indexed-sync";
import { notifyRemoteSyncLocalMutation } from "../storage/remote-sync";
import {
  createDefaultSceneSnapshot,
  createManualSceneTransaction,
  createRuntimeSceneTransaction,
  HISTORY_LIMIT,
  normalizeSceneSnapshot,
  PersistedSceneSnapshot,
  SCENE_STORE_KEY,
  SceneTransaction
} from "./scene-snapshot";

export interface SceneStoreState extends PersistedSceneSnapshot {
  isRollingBack: boolean;
  recordTransaction: (batch: CommandBatch) => void;
  recordSceneSnapshot: (sceneSnapshot: string) => void;
  rehydrateScene: () => Promise<void>;
  rollbackLast: () => Promise<boolean>;
  clearScene: () => Promise<void>;
  clearHistory: () => void;
}

const canUseStorage = (): boolean =>
  typeof localStorage !== "undefined" &&
  typeof localStorage.getItem === "function" &&
  typeof localStorage.setItem === "function";

const loadSnapshot = (): PersistedSceneSnapshot => {
  if (!canUseStorage()) {
    return createDefaultSceneSnapshot();
  }

  try {
    const raw = localStorage.getItem(SCENE_STORE_KEY);
    if (!raw) {
      return createDefaultSceneSnapshot();
    }

    return normalizeSceneSnapshot(JSON.parse(raw)) ?? createDefaultSceneSnapshot();
  } catch {
    return createDefaultSceneSnapshot();
  }
};

const persistSnapshot = (snapshot: PersistedSceneSnapshot): void => {
  if (!canUseStorage()) {
    return;
  }

  localStorage.setItem(SCENE_STORE_KEY, JSON.stringify(snapshot));
  void persistSceneSnapshotToIndexedDb(
    snapshot as unknown as Record<string, unknown>
  );
  notifyRemoteSyncLocalMutation();
};

const replayTransactions = async (
  transactions: SceneTransaction[]
): Promise<void> => {
  const adapter = getGeoGebraAdapter();
  adapter.evalCommand("DeleteAll[]");
  for (const tx of [...transactions].reverse()) {
    if (tx.sceneSnapshot && adapter.setXML) {
      adapter.setXML(tx.sceneSnapshot);
      continue;
    }
    await executeBatchWithAdapter(tx.batch, adapter);
  }
};

export const createSceneStore = () => {
  const initial = loadSnapshot();

  return createStore<SceneStoreState>((set, get) => ({
    ...initial,
    isRollingBack: false,
    recordTransaction: (batch) =>
      set((state) => {
        const transaction = createRuntimeSceneTransaction(batch);
        const transactions = [transaction, ...state.transactions].slice(
          0,
          HISTORY_LIMIT
        );
        persistSnapshot({
          schemaVersion: 1,
          transactions
        });
        return {
          transactions
        };
      }),
    recordSceneSnapshot: (sceneSnapshot) =>
      set((state) => {
        if (!sceneSnapshot.trim()) {
          return state;
        }
        if (state.transactions[0]?.sceneSnapshot === sceneSnapshot) {
          return state;
        }

        const transaction = createManualSceneTransaction(
          sceneSnapshot,
          state.transactions[0]
        );
        const transactions = [transaction, ...state.transactions].slice(
          0,
          HISTORY_LIMIT
        );
        persistSnapshot({
          schemaVersion: 1,
          transactions
        });
        return {
          transactions
        };
      }),
    rehydrateScene: async () => {
      const current = get().transactions;
      if (current.length === 0) {
        return;
      }

      await replayTransactions(current);
    },
    rollbackLast: async () => {
      const current = get().transactions;
      if (current.length === 0) {
        return false;
      }

      const next = current.slice(1);
      set(() => ({
        isRollingBack: true
      }));

      try {
        await replayTransactions(next);
        persistSnapshot({
          schemaVersion: 1,
          transactions: next
        });
        set(() => ({
          transactions: next,
          isRollingBack: false
        }));
        return true;
      } catch {
        try {
          await replayTransactions(current);
        } catch {
          // Ignore restore failure; UI still receives rollback failure.
        }
        set(() => ({
          isRollingBack: false
        }));
        return false;
      }
    },
    clearScene: async () => {
      const adapter = getGeoGebraAdapter();
      adapter.evalCommand("DeleteAll[]");
      persistSnapshot({
        schemaVersion: 1,
        transactions: []
      });
      set(() => ({
        transactions: []
      }));
    },
    clearHistory: () =>
      set(() => {
        persistSnapshot({
          schemaVersion: 1,
          transactions: []
        });
        return {
          transactions: []
        };
      })
  }));
};

export const sceneStore = createSceneStore();

const applySceneSnapshotToStore = (
  store: ReturnType<typeof createSceneStore>,
  snapshot: PersistedSceneSnapshot
): PersistedSceneSnapshot => {
  store.setState(() => ({
    schemaVersion: snapshot.schemaVersion,
    transactions: snapshot.transactions,
    isRollingBack: false
  }));
  return snapshot;
};

export const syncSceneStoreFromStorage = (
  store: ReturnType<typeof createSceneStore> = sceneStore
): PersistedSceneSnapshot => applySceneSnapshotToStore(store, loadSnapshot());

export const useSceneStore = <T>(selector: (state: SceneStoreState) => T): T =>
  useStore(sceneStore, selector);

export type { SceneTransaction } from "./scene-snapshot";
export { SCENE_STORE_KEY } from "./scene-snapshot";
