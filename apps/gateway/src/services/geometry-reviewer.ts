import {
  type GeometryDraftPackage,
  type GeometryReviewReport,
  GeometryReviewReportSchema} from "@geohelper/protocol";

import {
  buildGeometryContextSuffix,
  buildGeometryRequestEnvelope,
  serializeDraftSummary
} from "./geometry-agent-common";
import { type CompileInput, type RequestCommandBatch } from "./litellm-client";

export interface GeometryReviewerInput {
  draft: GeometryDraftPackage;
  compileInput: CompileInput;
}

export const createGeometryReviewer =
  (requestJson: RequestCommandBatch) =>
  async (input: GeometryReviewerInput): Promise<GeometryReviewReport> => {
    const response = await requestJson({
      ...input.compileInput,
      systemPrompt:
        "Return only valid JSON for a GeometryReviewReport. Do not include markdown.",
      message: buildGeometryRequestEnvelope("reviewer", [
        "Review the GeometryDraftPackage and return a GeometryReviewReport JSON object.",
        "Focus on correctness, ambiguity, naming clarity, teaching clarity, and explicit teacher confirmation needs.",
        `GeometryDraftPackage: ${serializeDraftSummary(input.draft)}${buildGeometryContextSuffix(
          input.compileInput
        )}`
      ])
    });

    return GeometryReviewReportSchema.parse(response);
  };
