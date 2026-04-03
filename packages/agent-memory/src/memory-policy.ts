import type { MemoryEntry } from "@geohelper/agent-protocol";

import type {
  MemoryWriteDecision,
  MemoryWriteInput
} from "./memory-types";

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, nestedValue]) =>
          `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`
      )
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

export interface MemoryWritePolicy {
  evaluate: (
    entry: MemoryWriteInput,
    existingEntries: MemoryEntry[]
  ) => MemoryWriteDecision;
}

export const createMemoryWritePolicy = (): MemoryWritePolicy => ({
  evaluate: (entry, existingEntries) => {
    const nextValue = stableSerialize(entry.value);
    const duplicate = existingEntries.find(
      (existingEntry) =>
        existingEntry.scope === entry.scope &&
        existingEntry.scopeId === entry.scopeId &&
        existingEntry.key === entry.key &&
        stableSerialize(existingEntry.value) === nextValue
    );

    if (duplicate) {
      return {
        action: "deduplicate",
        existingEntry: duplicate
      };
    }

    return {
      action: "write"
    };
  }
});
