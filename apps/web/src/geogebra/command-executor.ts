import { CommandBatch } from "@geohelper/protocol";

import { getGeoGebraAdapter, GeoGebraAdapter } from "./adapter";
import { opHandlers } from "./op-handlers";

const opHandlerEntries = opHandlers as Record<
  string,
  (args: Record<string, unknown>, adapter: GeoGebraAdapter) => void
>;

const ensureDependenciesResolved = (
  dependsOn: string[],
  completed: Set<string>
): void => {
  for (const dep of dependsOn) {
    if (!completed.has(dep)) {
      throw new Error(`Missing dependency: ${dep}`);
    }
  }
};

export const executeBatch = async (
  batch: CommandBatch,
  adapter: GeoGebraAdapter = getGeoGebraAdapter()
): Promise<void> => {
  await executeBatchWithAdapter(batch, adapter);
};

export const executeBatchWithAdapter = async (
  batch: CommandBatch,
  adapter: GeoGebraAdapter
): Promise<void> => {
  const completed = new Set<string>();

  for (const command of batch.commands) {
    ensureDependenciesResolved(command.depends_on, completed);

    const handler = opHandlerEntries[command.op];
    if (!handler) {
      throw new Error(`Unsupported op: ${String(command.op)}`);
    }

    handler(command.args, adapter);
    completed.add(command.id);
  }
};
