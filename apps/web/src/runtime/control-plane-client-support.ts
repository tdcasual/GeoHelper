import type {
  Artifact,
  Checkpoint,
  PlatformRunProfile,
  Run
} from "@geohelper/agent-protocol";
import type { DelegationSessionRecord } from "@geohelper/agent-store";

import type { AdminRunTimeline, PortableBundleCatalogEntry } from "./types";
import {
  buildQueryString,
  normalizeBundleCatalogEntry,
  requestJson,
  type ControlPlaneClientRequestContext
} from "./control-plane-client-shared";

export const createControlPlaneClientSupport = ({
  fetchImpl,
  resolvedBaseUrl
}: ControlPlaneClientRequestContext) => ({
  getArtifact: async (artifactId: string) => {
    const payload = await requestJson<{ artifact: Artifact }>(
      fetchImpl,
      `${resolvedBaseUrl}/api/v3/artifacts/${encodeURIComponent(artifactId)}`
    );
    return payload.artifact;
  },
  listAdminRuns: async (options: {
    status?: Run["status"];
    parentRunId?: string;
  } = {}) => {
    const payload = await requestJson<{ runs: Run[] }>(
      fetchImpl,
      `${resolvedBaseUrl}/admin/runs${buildQueryString({
        status: options.status,
        parentRunId: options.parentRunId
      })}`
    );
    return payload.runs;
  },
  getAdminRunTimeline: async (runId: string) =>
    requestJson<AdminRunTimeline>(
      fetchImpl,
      `${resolvedBaseUrl}/admin/runs/${encodeURIComponent(runId)}/timeline`
    ),
  listRunProfiles: async () => {
    const payload = await requestJson<{
      catalog: {
        runProfiles: PlatformRunProfile[];
      };
    }>(fetchImpl, `${resolvedBaseUrl}/api/v3/platform/catalog`);
    return payload.catalog.runProfiles;
  },
  listBundles: async () => {
    const payload = await requestJson<{
      bundles: PortableBundleCatalogEntry[];
    }>(fetchImpl, `${resolvedBaseUrl}/admin/bundles`);
    return payload.bundles.map(normalizeBundleCatalogEntry);
  },
  listDelegationSessions: async (options: {
    runId?: string;
    status?: DelegationSessionRecord["status"];
  } = {}) => {
    const payload = await requestJson<{
      sessions: DelegationSessionRecord[];
    }>(
      fetchImpl,
      `${resolvedBaseUrl}/api/v3/delegation-sessions${buildQueryString({
        runId: options.runId,
        status: options.status
      })}`
    );

    return payload.sessions;
  },
  forceReleaseDelegationSession: async (sessionId: string) => {
    const payload = await requestJson<{
      session: DelegationSessionRecord;
    }>(
      fetchImpl,
      `${resolvedBaseUrl}/admin/delegation-sessions/${encodeURIComponent(sessionId)}/release`,
      {
        method: "POST"
      }
    );
    return payload.session;
  },
  resolveCheckpoint: async (checkpointId: string, responsePayload: unknown) => {
    const payload = await requestJson<{
      checkpoint: Checkpoint;
    }>(
      fetchImpl,
      `${resolvedBaseUrl}/api/v3/checkpoints/${encodeURIComponent(checkpointId)}/resolve`,
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
});
