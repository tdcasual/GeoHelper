import {
  type GeometryDraftPackage,
  GeometryDraftPackageSchema} from "@geohelper/protocol";

import {
  buildGeometryContextSuffix,
  buildGeometryRequestEnvelope
} from "./geometry-agent-common";
import { type CompileInput, type RequestCommandBatch } from "./litellm-client";

export const createGeometryAuthor =
  (requestJson: RequestCommandBatch) =>
  async (input: CompileInput): Promise<GeometryDraftPackage> => {
    const response = await requestJson({
      ...input,
      systemPrompt:
        "Return only valid JSON for a GeometryDraftPackage. Do not include markdown.",
      message: buildGeometryRequestEnvelope("author", [
        "Produce a GeometryDraftPackage with normalizedIntent, assumptions, constructionPlan, namingPlan, commandBatchDraft, teachingOutline, and reviewChecklist.",
        `User request: ${input.message}${buildGeometryContextSuffix(input)}`
      ])
    });

    return GeometryDraftPackageSchema.parse(response);
  };
