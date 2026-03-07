import { CommandBatch, CommandBatchSchema } from "@geohelper/protocol";

export interface SceneTransaction {
  id: string;
  sceneId: string;
  transactionId: string;
  executedAt: number;
  commandCount: number;
  batch: CommandBatch;
  sceneSnapshot?: string;
  source?: "runtime" | "manual";
}

export interface PersistedSceneSnapshot {
  schemaVersion: 1;
  transactions: SceneTransaction[];
}

export const SCENE_STORE_KEY = "geohelper.scene.snapshot";
export const HISTORY_LIMIT = 200;

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const makeId = (): string =>
  `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

export const createDefaultSceneSnapshot = (): PersistedSceneSnapshot => ({
  schemaVersion: 1,
  transactions: []
});

export const sanitizeSceneTransaction = (
  value: unknown
): SceneTransaction | null => {
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
  const sceneSnapshot =
    typeof raw.sceneSnapshot === "string" && raw.sceneSnapshot.length > 0
      ? raw.sceneSnapshot
      : undefined;
  const source =
    raw.source === "manual" || raw.source === "runtime"
      ? raw.source
      : sceneSnapshot
        ? "manual"
        : "runtime";

  return {
    id: typeof raw.id === "string" ? raw.id : `scene_${makeId()}`,
    sceneId,
    transactionId,
    executedAt,
    commandCount:
      typeof raw.commandCount === "number"
        ? raw.commandCount
        : parsedBatch.data.commands.length,
    batch: parsedBatch.data,
    sceneSnapshot,
    source
  };
};

export const normalizeSceneSnapshot = (
  value: unknown
): PersistedSceneSnapshot | null => {
  const raw = asObject(value);
  if (!raw) {
    return null;
  }

  const transactions = Array.isArray(raw.transactions)
    ? raw.transactions
        .map((item) => sanitizeSceneTransaction(item))
        .filter((item): item is SceneTransaction => Boolean(item))
    : [];

  return {
    schemaVersion: 1,
    transactions
  };
};

const latestExecutedAt = (snapshot: PersistedSceneSnapshot): number =>
  snapshot.transactions.reduce(
    (latest, transaction) => Math.max(latest, transaction.executedAt),
    0
  );

export const mergeSceneSnapshots = (
  currentRaw: unknown,
  incomingRaw: unknown
): PersistedSceneSnapshot | null => {
  const current = normalizeSceneSnapshot(currentRaw);
  const incoming = normalizeSceneSnapshot(incomingRaw);

  if (!current && !incoming) {
    return null;
  }
  if (!current) {
    return incoming;
  }
  if (!incoming) {
    return current;
  }

  return latestExecutedAt(incoming) >= latestExecutedAt(current)
    ? incoming
    : current;
};

export const createRuntimeSceneTransaction = (
  batch: CommandBatch
): SceneTransaction => ({
  id: `scene_${makeId()}`,
  sceneId: batch.scene_id,
  transactionId: batch.transaction_id,
  executedAt: Date.now(),
  commandCount: batch.commands.length,
  batch,
  source: "runtime"
});

export const createManualSceneTransaction = (
  sceneSnapshot: string,
  previous?: SceneTransaction
): SceneTransaction => {
  const sceneId = previous?.sceneId ?? `scene_${makeId()}`;
  const transactionId = `manual_${makeId()}`;

  return {
    id: `scene_${makeId()}`,
    sceneId,
    transactionId,
    executedAt: Date.now(),
    commandCount: 0,
    batch: {
      version: previous?.batch.version ?? "1.0",
      scene_id: sceneId,
      transaction_id: transactionId,
      commands: [],
      post_checks: [],
      explanations: []
    },
    sceneSnapshot,
    source: "manual"
  };
};
