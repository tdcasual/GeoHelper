import {
  GeometryDraftPackageSchema,
  type GeometryDraftPackage,
  type GeometryReviewReport
} from "@geohelper/protocol";

import {
  buildGeometryContextSuffix,
  buildGeometryRequestEnvelope,
  serializeDraftSummary,
  serializeIssueList
} from "./geometry-agent-common";
import { type CompileInput, type RequestCommandBatch } from "./litellm-client";

export interface GeometryReviserInput {
  draft: GeometryDraftPackage;
  reviewReport: GeometryReviewReport;
  compileInput: CompileInput;
}

export const createGeometryReviser =
  (requestJson: RequestCommandBatch) =>
  async (input: GeometryReviserInput): Promise<GeometryDraftPackage> => {
    const response = await requestJson({
      ...input.compileInput,
      systemPrompt:
        "Return only valid JSON for a GeometryDraftPackage. Do not include markdown.",
      message: buildGeometryRequestEnvelope("reviser", [
        "Revise the GeometryDraftPackage and return a full replacement GeometryDraftPackage JSON object.",
        `Current draft: ${serializeDraftSummary(input.draft)}`,
        `Repair instructions: ${serializeIssueList(
          input.reviewReport.repairInstructions
        )}${buildGeometryContextSuffix(input.compileInput)}`
      ])
    });

    return GeometryDraftPackageSchema.parse(response);
  };
