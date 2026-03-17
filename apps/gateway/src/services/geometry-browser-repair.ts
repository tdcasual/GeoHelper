import {
  GeometryDraftPackageSchema,
  type AgentRunEnvelope,
  type GeometryCanvasEvidence,
  type GeometryDraftPackage
} from "@geohelper/protocol";

import {
  buildGeometryContextSuffix,
  buildGeometryRequestEnvelope,
  serializeDraftSummary
} from "./geometry-agent-common";
import { type CompileInput, type RequestCommandBatch } from "./litellm-client";

export interface GeometryBrowserRepairInput {
  sourceRun: AgentRunEnvelope;
  teacherInstruction: string;
  canvasEvidence: GeometryCanvasEvidence;
  compileInput: CompileInput;
}

export const createGeometryBrowserRepair =
  (requestJson: RequestCommandBatch) =>
  async (input: GeometryBrowserRepairInput): Promise<GeometryDraftPackage> => {
    const response = await requestJson({
      ...input.compileInput,
      systemPrompt:
        "Return only valid JSON for a GeometryDraftPackage. Do not include markdown.",
      message: buildGeometryRequestEnvelope("reviser", [
        "Repair the GeometryDraftPackage against the current browser-side canvas evidence and the teacher's targeted instruction.",
        `Original draft: ${serializeDraftSummary(input.sourceRun.draft)}`,
        `Current teacher packet: ${serializeDraftSummary(input.sourceRun.teacherPacket)}`,
        `Canvas evidence: ${serializeDraftSummary(input.canvasEvidence)}`,
        `Teacher instruction: ${JSON.stringify(input.teacherInstruction)}${buildGeometryContextSuffix(
          input.compileInput
        )}`
      ])
    });

    return GeometryDraftPackageSchema.parse(response);
  };
