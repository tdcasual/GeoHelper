import type { RunSnapshot } from "@geohelper/agent-store";

import { threadStore } from "../state/thread-store";
import { createControlPlaneClient } from "./control-plane-client";
import type { RuntimeRunRequest, RuntimeRunResponse } from "./types";

const buildThreadTitle = (message: string): string => {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "新线程";
  }

  return normalized.length > 24 ? `${normalized.slice(0, 24)}...` : normalized;
};

const buildFallbackSnapshot = (snapshot: RunSnapshot): RunSnapshot => ({
  ...snapshot,
  artifacts: snapshot.artifacts ?? [],
  checkpoints: snapshot.checkpoints ?? [],
  events: snapshot.events ?? [],
  memoryEntries: snapshot.memoryEntries ?? []
});

export const submitPromptToPlatform = async (
  request: RuntimeRunRequest
): Promise<RuntimeRunResponse> => {
  const client = createControlPlaneClient({
    baseUrl: request.baseUrl
  });
  const threadState = threadStore.getState();
  const existingThreadId =
    threadState.threadIdByConversationId[request.conversationId];

  let threadId = existingThreadId;
  if (!threadId) {
    const thread = await client.createThread({
      title: buildThreadTitle(request.message)
    });
    threadStore.getState().bindConversationThread(request.conversationId, thread);
    threadId = thread.id;
  }

  const run = await client.startRun({
    threadId,
    agentId: request.platformRunProfile.agentId,
    workflowId: request.platformRunProfile.workflowId,
    budget: request.platformRunProfile.defaultBudget
  });
  const snapshot = await client.streamRun(run.id);

  return {
    trace_id: run.id,
    run_snapshot: buildFallbackSnapshot(snapshot)
  };
};
