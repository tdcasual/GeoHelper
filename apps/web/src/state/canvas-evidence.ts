import type {
  AgentRunEnvelope,
  GeometryCanvasEvidence
} from "@geohelper/protocol";

export const buildCanvasEvidence = (input: {
  executedCommandIds: string[];
  failedCommandIds?: string[];
  visibleLabels: string[];
  createdLabels?: string[];
  sceneXml?: string | null;
  teacherFocus?: string;
}): GeometryCanvasEvidence => {
  const normalizeList = (items: string[] | undefined): string[] =>
    [...new Set((items ?? []).map((item) => item.trim()).filter(Boolean))];
  const sceneXml =
    typeof input.sceneXml === "string" && input.sceneXml.trim()
      ? input.sceneXml.trim()
      : undefined;
  const teacherFocus =
    typeof input.teacherFocus === "string" && input.teacherFocus.trim()
      ? input.teacherFocus.trim()
      : undefined;

  return {
    executedCommandCount: input.executedCommandIds.length,
    failedCommandIds: normalizeList(input.failedCommandIds),
    createdLabels: normalizeList(input.createdLabels),
    visibleLabels: normalizeList(input.visibleLabels),
    ...(sceneXml ? { sceneXml } : {}),
    ...(teacherFocus ? { teacherFocus } : {})
  };
};

export const buildCanvasEvidenceFromAgentRun = (input: {
  agentRun: AgentRunEnvelope;
  sceneXml?: string | null;
  visibleLabels?: string[];
  teacherFocus?: string;
}): GeometryCanvasEvidence =>
  buildCanvasEvidence({
    executedCommandIds: input.agentRun.draft.commandBatchDraft.commands.map(
      (command) => command.id
    ),
    failedCommandIds: input.agentRun.evidence.canvas?.failedCommandIds ?? [],
    createdLabels:
      input.agentRun.evidence.canvas?.createdLabels ??
      input.agentRun.evidence.preflight.generatedLabels,
    visibleLabels:
      input.visibleLabels && input.visibleLabels.length > 0
        ? input.visibleLabels
        : input.agentRun.evidence.canvas?.visibleLabels ??
          input.agentRun.evidence.preflight.generatedLabels,
    sceneXml: input.sceneXml ?? input.agentRun.evidence.canvas?.sceneXml,
    teacherFocus: input.teacherFocus
  });

export const buildCanvasEvidenceForRepair = (input: {
  agentRun: AgentRunEnvelope;
  uncertaintyId: string;
  sceneXml?: string | null;
}): GeometryCanvasEvidence => {
  const uncertainty = input.agentRun.teacherPacket.uncertainties.find(
    (item) => item.id === input.uncertaintyId
  );
  const canvasLink = input.agentRun.teacherPacket.canvasLinks.find(
    (item) => item.uncertaintyId === input.uncertaintyId
  );

  return buildCanvasEvidenceFromAgentRun({
    agentRun: input.agentRun,
    sceneXml: input.sceneXml,
    visibleLabels:
      canvasLink?.objectLabels ??
      input.agentRun.evidence.canvas?.visibleLabels ??
      input.agentRun.evidence.preflight.generatedLabels,
    teacherFocus: uncertainty?.label ?? canvasLink?.text
  });
};
