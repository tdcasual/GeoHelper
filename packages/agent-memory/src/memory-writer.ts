import { MemoryEntrySchema } from "@geohelper/agent-protocol";
import type { MemoryRepo } from "@geohelper/agent-store";

import {
  createMemoryWritePolicy,
  type MemoryWritePolicy
} from "./memory-policy";
import type { MemoryWriteInput, MemoryWriteResult } from "./memory-types";

export interface MemoryWriter {
  write: (input: MemoryWriteInput) => Promise<MemoryWriteResult>;
}

export interface CreateMemoryWriterOptions {
  memoryRepo: Pick<MemoryRepo, "writeMemoryEntry" | "listMemoryEntries">;
  policy?: MemoryWritePolicy;
}

export const createMemoryWriter = ({
  memoryRepo,
  policy = createMemoryWritePolicy()
}: CreateMemoryWriterOptions): MemoryWriter => ({
  write: async (input) => {
    const entry = MemoryEntrySchema.parse(input);
    const existingEntries = await memoryRepo.listMemoryEntries({
      scope: entry.scope,
      scopeId: entry.scopeId,
      key: entry.key
    });

    const decision = policy.evaluate(input, existingEntries);

    if (decision.action === "deduplicate") {
      return {
        status: "deduplicated",
        entry: decision.existingEntry
      };
    }

    await memoryRepo.writeMemoryEntry(entry);

    return {
      status: "written",
      entry
    };
  }
});
