import {
  type GeometryDraftPackage,
  type GeometryPreflightEvidence,
  GeometryPreflightEvidenceSchema
} from "@geohelper/protocol";

import {
  InvalidCommandBatchError,
  verifyCommandBatch
} from "./verify-command-batch";

const readText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const extractLabelInventory = (
  draft: GeometryDraftPackage
): {
  referencedLabels: string[];
  generatedLabels: string[];
} => {
  const referenced = new Set<string>();
  const generated = new Set<string>();

  for (const command of draft.commandBatchDraft.commands) {
    const args = command.args as Record<string, unknown>;

    const maybeGenerated =
      command.op === "create_point" || command.op === "create_slider"
        ? readText(args.name)
        : "";
    if (maybeGenerated) {
      generated.add(maybeGenerated);
      referenced.add(maybeGenerated);
    }

    const maybeReferenced = [
      readText(args.from),
      readText(args.to),
      readText(args.center),
      command.op === "set_property" ? readText(args.name) : ""
    ];
    for (const label of maybeReferenced) {
      if (label) {
        referenced.add(label);
      }
    }
  }

  for (const label of draft.namingPlan) {
    if (label) {
      referenced.add(label);
    }
  }

  return {
    referencedLabels: [...referenced],
    generatedLabels: [...generated]
  };
};

export const createGeometryPreflight =
  () =>
  async (draft: GeometryDraftPackage): Promise<GeometryPreflightEvidence> => {
    const inventory = extractLabelInventory(draft);
    const dependencySummary = {
      commandCount: draft.commandBatchDraft.commands.length,
      edgeCount: draft.commandBatchDraft.commands.reduce(
        (total, command) => total + command.depends_on.length,
        0
      )
    };

    try {
      verifyCommandBatch(draft.commandBatchDraft);
      return GeometryPreflightEvidenceSchema.parse({
        status: "passed",
        issues: [],
        referencedLabels: inventory.referencedLabels,
        generatedLabels: inventory.generatedLabels,
        dependencySummary
      });
    } catch (error) {
      const issues =
        error instanceof InvalidCommandBatchError
          ? error.issues
          : [error instanceof Error ? error.message : "unknown_preflight_error"];

      return GeometryPreflightEvidenceSchema.parse({
        status: "failed",
        issues,
        referencedLabels: inventory.referencedLabels,
        generatedLabels: inventory.generatedLabels,
        dependencySummary
      });
    }
  };
