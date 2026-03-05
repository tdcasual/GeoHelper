import { CommandBatch, CommandBatchSchema } from "@geohelper/protocol";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

import { getGeoGebraAdapter } from "../geogebra/adapter";
import { executeBatchWithAdapter } from "../geogebra/command-executor";
import { persistSceneSnapshotToIndexedDb } from "../storage/indexed-sync";

export interface SceneTransaction {
  id: string;
  sceneId: string;
  transactionId: string;
  executedAt: number;
  commandCount: number;
  batch: CommandBatch;
}

interface PersistedSceneSnapshot {
  schemaVersion: 1;
  transactions: SceneTransaction[];
}

export interface SceneStoreState extends PersistedSceneSnapshot {
  isRollingBack: boolean;
  recordTransaction: (batch: CommandBatch) => void;
  rollbackLast: () => Promise<boolean>;
  clearScene: () => Promise<void>;
  clearHistory: () => void;
}

export const SCENE_STORE_KEY = "geohelper.scene.snapshot";
const HISTORY_LIMIT = 200;

const canUseStorage = (): boolean =>
  typeof localStorage !== "undefined" &&
  typeof localStorage.getItem === "function" &&
  typeof localStorage.setItem === "function";

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const makeId = (): string => `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

const sanitizeTransaction = (value: unknown): SceneTransaction | null => {
  const raw = asObject(value);
  if (!raw) {
    return null;
  }

  const parsedBatch = CommandBatchSchema.safeParse(raw.batch);
  if (!parsedBatch.success) {
    return null;
  }

  const transactionId =
    typeof raw.transactionId === "string"
      ? raw.transactionId
      : parsedBatch.data.transaction_id;
  const sceneId =
    typeof raw.sceneId === "string" ? raw.sceneId : parsedBatch.data.scene_id;
  const executedAt =
    typeof raw.executedAt === "number" ? raw.executedAt : Date.now();

  return {
    id: typeof raw.id === "string" ? raw.id : `scene_${makeId()}`,
    sceneId,
    transactionId,
    executedAt,
    commandCount:
      typeof raw.commandCount === "number"
        ? raw.commandCount
        : parsedBatch.data.commands.length,
    batch: parsedBatch.data
  };
};

const makeDefaultSnapshot = (): PersistedSceneSnapshot => ({
  schemaVersion: 1,
  transactions: []
});

const loadSnapshot = (): PersistedSceneSnapshot => {
  if (!canUseStorage()) {
    return makeDefaultSnapshot();
  }

  try {
    const raw = localStorage.getItem(SCENE_STORE_KEY);
    if (!raw) {
      return makeDefaultSnapshot();
    }

    const parsed = JSON.parse(raw) as {
      schemaVersion?: unknown;
      transactions?: unknown;
    };

    const transactions = Array.isArray(parsed.transactions)
      ? parsed.transactions
          .map((item) => sanitizeTransaction(item))
          .filter((item): item is SceneTransaction => Boolean(item))
      : [];

    return {
      schemaVersion: 1,
      transactions
    };
  } catch {
    return makeDefaultSnapshot();
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
};

const replayTransactions = async (
  transactions: SceneTransaction[]
): Promise<void> => {
  const adapter = getGeoGebraAdapter();
  adapter.evalCommand("DeleteAll[]");
  for (const tx of [...transactions].reverse()) {
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
        const transaction: SceneTransaction = {
          id: `scene_${makeId()}`,
          sceneId: batch.scene_id,
          transactionId: batch.transaction_id,
          executedAt: Date.now(),
          commandCount: batch.commands.length,
          batch
        };
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
        // Try to restore current state if rollback replay fails.
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
      set((state) => {
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

export const useSceneStore = <T>(selector: (state: SceneStoreState) => T): T =>
  useStore(sceneStore, selector);
