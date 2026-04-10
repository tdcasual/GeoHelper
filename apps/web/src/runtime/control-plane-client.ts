import type {
  Artifact,
  Checkpoint,
  PlatformRunProfile,
  Run
} from "@geohelper/agent-protocol";
import type { DelegationSessionRecord, RunSnapshot } from "@geohelper/agent-store";

import type { PlatformThread } from "../state/thread-store";
import { createControlPlaneClientSupport } from "./control-plane-client-support";
import {
  normalizeBaseUrl,
  requestJson,
  requestText
} from "./control-plane-client-shared";
import { buildRunStreamUrl, parseRunStreamPayload } from "./control-plane-stream";
import type { AdminRunTimeline, PortableBundleCatalogEntry } from "./types";

export interface ControlPlaneClient {
  createThread: (input: { title: string }) => Promise<PlatformThread>;
  getThread: (threadId: string) => Promise<PlatformThread>;
  getArtifact: (artifactId: string) => Promise<Artifact>;
  listAdminRuns: (options?: {
    status?: Run["status"];
    parentRunId?: string;
  }) => Promise<Run[]>;
  getAdminRunTimeline: (runId: string) => Promise<AdminRunTimeline>;
  listRunProfiles: () => Promise<PlatformRunProfile[]>;
  listBundles: () => Promise<PortableBundleCatalogEntry[]>;
  startRun: (input: {
    threadId: string;
    profileId: string;
    inputArtifactIds?: string[];
  }) => Promise<RunSnapshot["run"]>;
  streamRun: (
    runId: string,
    options?: {
      afterSequence?: number;
    }
  ) => Promise<RunSnapshot>;
  cancelRun: (runId: string) => Promise<Run>;
  listDelegationSessions: (options?: {
    runId?: string;
    status?: DelegationSessionRecord["status"];
  }) => Promise<DelegationSessionRecord[]>;
  forceReleaseDelegationSession: (
    sessionId: string
  ) => Promise<DelegationSessionRecord>;
  resolveCheckpoint: (
    checkpointId: string,
    response: unknown
  ) => Promise<Checkpoint>;
}

export interface ControlPlaneClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export const createControlPlaneClient = ({
  baseUrl = "",
  fetchImpl = fetch
}: ControlPlaneClientOptions = {}): ControlPlaneClient => {
  const resolvedBaseUrl = normalizeBaseUrl(baseUrl);

  return {
    createThread: async ({ title }) => {
      const payload = await requestJson<{ thread: PlatformThread }>(
        fetchImpl,
        `${resolvedBaseUrl}/api/v3/threads`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            title
          })
        }
      );
      return payload.thread;
    },
    getThread: async (threadId) => {
      const payload = await requestJson<{ thread: PlatformThread }>(
        fetchImpl,
        `${resolvedBaseUrl}/api/v3/threads/${encodeURIComponent(threadId)}`
      );
      return payload.thread;
    },
    startRun: async ({
      threadId,
      profileId,
      inputArtifactIds = []
    }) => {
      const payload = await requestJson<{ run: RunSnapshot["run"] }>(
        fetchImpl,
        `${resolvedBaseUrl}/api/v3/threads/${encodeURIComponent(threadId)}/runs`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            profileId,
            inputArtifactIds
          })
        }
      );
      return payload.run;
    },
    streamRun: async (runId, options = {}) => {
      const runStreamPath = `/api/v3/runs/${encodeURIComponent(runId)}/stream`;
      return parseRunStreamPayload(
        await requestText(
          fetchImpl,
          buildRunStreamUrl({
            baseUrl: resolvedBaseUrl,
            path: runStreamPath,
            afterSequence: options.afterSequence
          })
        )
      );
    },
    cancelRun: async (runId) => {
      const payload = await requestJson<{ run: Run }>(
        fetchImpl,
        `${resolvedBaseUrl}/api/v3/runs/${encodeURIComponent(runId)}/cancel`,
        {
          method: "POST"
        }
      );
      return payload.run;
    },
    ...createControlPlaneClientSupport({
      fetchImpl,
      resolvedBaseUrl
    })
  };
};
