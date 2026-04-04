import type { Checkpoint } from "@geohelper/agent-protocol";
import type { RunSnapshot } from "@geohelper/agent-store";

import type { PlatformThread } from "../state/thread-store";

export interface ControlPlaneClient {
  createThread: (input: { title: string }) => Promise<PlatformThread>;
  startRun: (input: {
    threadId: string;
    agentId: string;
    workflowId: string;
    inputArtifactIds?: string[];
  }) => Promise<RunSnapshot["run"]>;
  streamRun: (runId: string) => Promise<RunSnapshot>;
  resolveCheckpoint: (
    checkpointId: string,
    response: unknown
  ) => Promise<Checkpoint>;
}

export interface ControlPlaneClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const normalizeBaseUrl = (baseUrl = ""): string => baseUrl.replace(/\/+$/, "");

const parseSseSnapshot = (payload: string): RunSnapshot => {
  const dataLine = payload
    .split("\n")
    .find((line) => line.startsWith("data: "));

  if (!dataLine) {
    throw new Error("invalid_run_stream_payload");
  }

  return JSON.parse(dataLine.slice(6)) as RunSnapshot;
};

export const createControlPlaneClient = ({
  baseUrl = "",
  fetchImpl = fetch
}: ControlPlaneClientOptions = {}): ControlPlaneClient => {
  const resolvedBaseUrl = normalizeBaseUrl(baseUrl);

  return {
    createThread: async ({ title }) => {
      const response = await fetchImpl(`${resolvedBaseUrl}/api/v3/threads`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          title
        })
      });
      const payload = (await response.json()) as {
        thread: PlatformThread;
      };

      return payload.thread;
    },
    startRun: async ({ threadId, agentId, workflowId, inputArtifactIds = [] }) => {
      const response = await fetchImpl(
        `${resolvedBaseUrl}/api/v3/threads/${encodeURIComponent(threadId)}/runs`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            agentId,
            workflowId,
            inputArtifactIds
          })
        }
      );
      const payload = (await response.json()) as {
        run: RunSnapshot["run"];
      };

      return payload.run;
    },
    streamRun: async (runId) => {
      const response = await fetchImpl(
        `${resolvedBaseUrl}/api/v3/runs/${encodeURIComponent(runId)}/stream`
      );
      const payload = await response.text();

      return parseSseSnapshot(payload);
    },
    resolveCheckpoint: async (checkpointId, responsePayload) => {
      const response = await fetchImpl(
        `${resolvedBaseUrl}/api/v3/checkpoints/${encodeURIComponent(
          checkpointId
        )}/resolve`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            response: responsePayload
          })
        }
      );
      const payload = (await response.json()) as {
        checkpoint: Checkpoint;
      };

      return payload.checkpoint;
    }
  };
};
