export type ChatStudioResultStatus = "success" | "guard" | "error";
export type ChatStudioUncertaintyReviewStatus =
  | "pending"
  | "confirmed"
  | "needs_fix";

export interface ChatStudioCanvasLink {
  id: string;
  scope: "summary" | "warning" | "uncertainty";
  text: string;
  objectLabels: string[];
  uncertaintyId?: string;
}

export interface ChatStudioUncertaintyItem {
  id: string;
  label: string;
  followUpPrompt: string;
  reviewStatus: ChatStudioUncertaintyReviewStatus;
}

export interface ChatStudioResult {
  status: ChatStudioResultStatus;
  commandCount: number;
  summaryItems: string[];
  explanationLines: string[];
  warningItems: string[];
  uncertaintyItems: ChatStudioUncertaintyItem[];
  canvasLinks: ChatStudioCanvasLink[];
}

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
};

const normalizeReviewStatus = (
  value: unknown
): ChatStudioUncertaintyReviewStatus =>
  value === "confirmed" || value === "needs_fix" ? value : "pending";

const toUncertaintyId = (label: string, index: number): string => {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  return `unc_${normalized || index + 1}`;
};

export const buildUncertaintyFollowUpPrompt = (label: string): string =>
  `请基于当前图形结果，重新检查并明确以下待确认条件：${label}。如果条件不成立，也请直接指出。`;

const normalizeUncertaintyItems = (
  value: unknown
): ChatStudioUncertaintyItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      const objectValue = asObject(item);
      const label =
        typeof objectValue?.label === "string" ? objectValue.label.trim() : "";
      if (!label) {
        return null;
      }

      const id =
        typeof objectValue?.id === "string" && objectValue.id.trim()
          ? objectValue.id.trim()
          : toUncertaintyId(label, index);
      const followUpPrompt =
        typeof objectValue?.followUpPrompt === "string" &&
        objectValue.followUpPrompt.trim()
          ? objectValue.followUpPrompt.trim()
          : buildUncertaintyFollowUpPrompt(label);

      return {
        id,
        label,
        followUpPrompt,
        reviewStatus: normalizeReviewStatus(objectValue?.reviewStatus)
      } satisfies ChatStudioUncertaintyItem;
    })
    .filter((item): item is ChatStudioUncertaintyItem => Boolean(item));
};

const normalizeCanvasLinks = (value: unknown): ChatStudioCanvasLink[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const objectValue = asObject(item);
      const id = typeof objectValue?.id === "string" ? objectValue.id.trim() : "";
      const scope = objectValue?.scope;
      const text =
        typeof objectValue?.text === "string" ? objectValue.text.trim() : "";
      const objectLabels = normalizeStringArray(objectValue?.objectLabels);
      if (
        !id ||
        (scope !== "summary" &&
          scope !== "warning" &&
          scope !== "uncertainty") ||
        !text ||
        objectLabels.length === 0
      ) {
        return null;
      }

      const uncertaintyId =
        typeof objectValue?.uncertaintyId === "string" &&
        objectValue.uncertaintyId.trim()
          ? objectValue.uncertaintyId.trim()
          : undefined;

      return uncertaintyId
        ? ({
            id,
            scope,
            text,
            objectLabels,
            uncertaintyId
          } satisfies ChatStudioCanvasLink)
        : ({
            id,
            scope,
            text,
            objectLabels
          } satisfies ChatStudioCanvasLink);
    })
    .filter((item): item is ChatStudioCanvasLink => item !== null);
};

export const normalizeChatStudioResult = (
  value: unknown
): ChatStudioResult | undefined => {
  const objectValue = asObject(value);
  if (!objectValue) {
    return undefined;
  }
  const status = objectValue?.status;
  const commandCount = objectValue?.commandCount;

  if (
    status !== "success" &&
    status !== "guard" &&
    status !== "error"
  ) {
    return undefined;
  }

  if (typeof commandCount !== "number" || !Number.isFinite(commandCount)) {
    return undefined;
  }

  const summaryItems = normalizeStringArray(objectValue.summaryItems);
  if (summaryItems.length === 0) {
    return undefined;
  }

  return {
    status,
    commandCount: Math.max(0, commandCount),
    summaryItems,
    explanationLines: normalizeStringArray(objectValue.explanationLines),
    warningItems: normalizeStringArray(objectValue.warningItems),
    uncertaintyItems: normalizeUncertaintyItems(objectValue.uncertaintyItems),
    canvasLinks: normalizeCanvasLinks(objectValue.canvasLinks)
  };
};
