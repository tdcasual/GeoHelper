import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export interface SceneFocusRequest {
  requestId: string;
  source: "summary" | "warning" | "uncertainty";
  objectLabels: string[];
  revealCanvas: boolean;
  requestedAt: number;
  expiresAt: number;
}

interface SceneFocusRequestInput {
  source: SceneFocusRequest["source"];
  objectLabels: string[];
  revealCanvas?: boolean;
  ttlMs?: number;
}

export interface SceneFocusStoreState {
  focusRequest: SceneFocusRequest | null;
  requestFocus: (input: SceneFocusRequestInput) => SceneFocusRequest | null;
  consumeFocusRequest: (requestId: string) => SceneFocusRequest | null;
  clearFocusRequest: () => void;
}

const DEFAULT_TTL_MS = 1800;

const makeRequestId = (): string =>
  `focus_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

const normalizeObjectLabels = (objectLabels: string[]): string[] =>
  [...new Set(objectLabels.map((item) => item.trim()).filter(Boolean))];

export const createSceneFocusStore = () => {
  let clearTimer: ReturnType<typeof setTimeout> | null = null;

  const clearScheduledTimer = () => {
    if (clearTimer !== null) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
  };

  const store = createStore<SceneFocusStoreState>((set, get) => ({
    focusRequest: null,
    requestFocus: (input) => {
      const objectLabels = normalizeObjectLabels(input.objectLabels);
      if (objectLabels.length === 0) {
        return null;
      }

      clearScheduledTimer();
      const requestedAt = Date.now();
      const ttlMs = Math.max(0, input.ttlMs ?? DEFAULT_TTL_MS);
      const request: SceneFocusRequest = {
        requestId: makeRequestId(),
        source: input.source,
        objectLabels,
        revealCanvas: input.revealCanvas ?? true,
        requestedAt,
        expiresAt: requestedAt + ttlMs
      };

      set(() => ({
        focusRequest: request
      }));

      clearTimer = setTimeout(() => {
        const current = get().focusRequest;
        if (current?.requestId === request.requestId) {
          set(() => ({
            focusRequest: null
          }));
        }
        clearTimer = null;
      }, ttlMs);

      return request;
    },
    consumeFocusRequest: (requestId) => {
      const current = get().focusRequest;
      if (!current || current.requestId !== requestId) {
        return null;
      }

      clearScheduledTimer();
      set(() => ({
        focusRequest: null
      }));
      return current;
    },
    clearFocusRequest: () => {
      clearScheduledTimer();
      set(() => ({
        focusRequest: null
      }));
    }
  }));

  return store;
};

export const sceneFocusStore = createSceneFocusStore();

export const useSceneFocusStore = <T>(
  selector: (state: SceneFocusStoreState) => T
): T => useStore(sceneFocusStore, selector);
