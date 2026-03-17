import { asObject } from "./backup-snapshot";

type TemplateRecord = Record<string, unknown> & {
  id: string;
  updatedAt: number;
};

const toTemplateList = (value: unknown): TemplateRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      ...item,
      id: String(item.id ?? ""),
      title:
        typeof item.title === "string" && item.title.trim()
          ? item.title
          : "未命名模板",
      prompt:
        typeof item.prompt === "string" && item.prompt.trim()
          ? item.prompt
          : "",
      category:
        typeof item.category === "string" && item.category.trim()
          ? item.category
          : "custom",
      updatedAt:
        typeof item.updatedAt === "number" ? item.updatedAt : Date.now()
    }))
    .filter((item) => item.id.length > 0 && item.prompt.length > 0);
};

const mergeByIdAndUpdatedAt = (
  current: TemplateRecord[],
  incoming: TemplateRecord[]
): TemplateRecord[] => {
  const merged = new Map<string, TemplateRecord>();

  for (const item of current) {
    merged.set(item.id, item);
  }

  for (const item of incoming) {
    const existing = merged.get(item.id);
    if (!existing || item.updatedAt >= existing.updatedAt) {
      merged.set(item.id, item);
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
};

export const normalizeTemplatesSnapshot = (
  value: unknown
): Record<string, unknown> | null => {
  if (Array.isArray(value)) {
    return {
      schemaVersion: 1,
      templates: toTemplateList(value)
    };
  }

  const snapshot = asObject(value);
  if (!snapshot) {
    return null;
  }

  return {
    schemaVersion: 1,
    templates: toTemplateList(snapshot.templates)
  };
};

export const mergeTemplatesSnapshot = (
  currentRaw: unknown,
  incomingRaw: unknown
): Record<string, unknown> | null => {
  const current = normalizeTemplatesSnapshot(currentRaw);
  const incoming = normalizeTemplatesSnapshot(incomingRaw);

  if (!current && !incoming) {
    return null;
  }
  if (!current) {
    return incoming;
  }
  if (!incoming) {
    return current;
  }

  return {
    schemaVersion: 1,
    templates: mergeByIdAndUpdatedAt(
      toTemplateList(current.templates),
      toTemplateList(incoming.templates)
    )
  };
};
