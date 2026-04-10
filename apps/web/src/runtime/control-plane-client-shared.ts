import type { PortableBundleCatalogEntry } from "./types";
import { RuntimeApiError } from "./runtime-service";

export interface ControlPlaneClientRequestContext {
  fetchImpl: typeof fetch;
  resolvedBaseUrl: string;
}

export const normalizeBaseUrl = (baseUrl = ""): string =>
  baseUrl.replace(/\/+$/, "");

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

export const requestJson = async <T>(
  fetchImpl: typeof fetch,
  input: string,
  init?: RequestInit
): Promise<T> => {
  const response = await fetchImpl(input, init);
  if (!response.ok) {
    throw await parseErrorPayload(response);
  }

  return (await response.json()) as T;
};

export const requestText = async (
  fetchImpl: typeof fetch,
  input: string,
  init?: RequestInit
): Promise<string> => {
  const response = await fetchImpl(input, init);
  if (!response.ok) {
    throw await parseErrorPayload(response);
  }

  return await response.text();
};

export const buildQueryString = (
  params: Record<string, string | undefined>
): string => {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();

  return query ? `?${query}` : "";
};

export const normalizeBundleCatalogEntry = (
  bundle: PortableBundleCatalogEntry
): PortableBundleCatalogEntry => {
  const rehearsedExtractionCandidate = Boolean(
    bundle.openClawCompatibility.rehearsedExtractionCandidate
  );
  const extractionBlockers = Array.isArray(
    bundle.openClawCompatibility.extractionBlockers
  )
    ? bundle.openClawCompatibility.extractionBlockers
    : [];

  return {
    ...bundle,
    openClawCompatibility: {
      ...bundle.openClawCompatibility,
      rehearsedExtractionCandidate,
      extractionBlockers
    },
    audit: bundle.audit ?? {
      rehearsedExtractionCandidate,
      extractionBlockers,
      verifyImport: null
    }
  };
};
