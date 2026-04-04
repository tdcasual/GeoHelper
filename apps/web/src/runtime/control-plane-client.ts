import type { Checkpoint, RunBudget } from "@geohelper/agent-protocol";
import type { RunSnapshot } from "@geohelper/agent-store";

import type { PlatformThread } from "../state/thread-store";
import { RuntimeApiError } from "./runtime-service";

export interface ControlPlaneClient {
  createThread: (input: { title: string }) => Promise<PlatformThread>;
  startRun: (input: {
    threadId: string;
    agentId: string;
    workflowId: string;
    inputArtifactIds?: string[];
    budget?: RunBudget;
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

const parseErrorPayload = async (response: Response): Promise<RuntimeApiError> => {
  try {
    const payload = (await response.json()) as {
      error?:
        | {
            code?: string;
            message?: string;
          }
        | string;
      message?: string;
    };

    if (typeof payload.error === "string") {
      return new RuntimeApiError(payload.error, payload.error, response.status);
    }

    if (payload.error?.code || payload.error?.message) {
      return new RuntimeApiError(
        payload.error.code ?? "RUNTIME_REQUEST_FAILED",
        payload.error.message ?? "Runtime request failed",
        response.status
      );
    }

    if (payload.message) {
      return new RuntimeApiError(
        "RUNTIME_REQUEST_FAILED",
        payload.message,
        response.status
      );
    }
  } catch {
    // Ignore parse failures and fall back to the status text.
  }

  return new RuntimeApiError(
    "RUNTIME_REQUEST_FAILED",
    response.statusText || "Runtime request failed",
    response.status
  );
};

const requestJson = async <T>(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit = {}
): Promise<T> => {
  const response = await fetchImpl(input, init);
  if (!response.ok) {
    throw await parseErrorPayload(response);
  }

  return (await response.json()) as T;
};

const requestText = async (
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit = {}
): Promise<string> => {
  const response = await fetchImpl(input, init);
  if (!response.ok) {
    throw await parseErrorPayload(response);
  }

  return await response.text();
};

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
      const payload = await requestJson<{
        thread: PlatformThread;
      }>(fetchImpl, `${resolvedBaseUrl}/api/v3/threads`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          title
        })
      });

      return payload.thread;
    },
    startRun: async ({
      threadId,
      agentId,
      workflowId,
      inputArtifactIds = [],
      budget
    }) => {
      const payload = await requestJson<{
        run: RunSnapshot["run"];
      }>(
        fetchImpl,
        `${resolvedBaseUrl}/api/v3/threads/${encodeURIComponent(threadId)}/runs`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            agentId,
            workflowId,
            inputArtifactIds,
            budget
          })
        }
      );

      return payload.run;
    },
    streamRun: async (runId) =>
      parseSseSnapshot(
        await requestText(
          fetchImpl,
        `${resolvedBaseUrl}/api/v3/runs/${encodeURIComponent(runId)}/stream`
        )
      ),
    resolveCheckpoint: async (checkpointId, responsePayload) => {
      const payload = await requestJson<{
        checkpoint: Checkpoint;
      }>(
        fetchImpl,
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

      return payload.checkpoint;
    }
  };
};
