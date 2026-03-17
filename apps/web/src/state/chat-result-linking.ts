import type {
  ChatStudioCanvasLink,
  ChatStudioUncertaintyItem
} from "./chat-result";

interface BuildStudioCanvasLinksInput {
  summaryItems: string[];
  warningItems: string[];
  uncertaintyItems: ChatStudioUncertaintyItem[];
}

const splitCompactToken = (token: string): string[] => token.trim().split("");

const pushUnique = (target: string[], items: string[]) => {
  for (const item of items) {
    const normalized = item.trim();
    if (normalized && !target.includes(normalized)) {
      target.push(normalized);
    }
  }
};

const collectMatches = (
  text: string,
  regex: RegExp,
  toLabels: (token: string) => string[]
): string[] => {
  const labels: string[] = [];

  for (const match of text.matchAll(regex)) {
    const token = match[1]?.trim() ?? "";
    if (!token) {
      continue;
    }
    pushUnique(labels, toLabels(token));
  }

  return labels;
};

export const extractObjectLabelsFromText = (text: string): string[] => {
  const labels: string[] = [];

  pushUnique(
    labels,
    collectMatches(text, /(?:点|顶点)\s*([A-Za-z][A-Za-z0-9]*)/g, (token) => [
      token
    ])
  );
  pushUnique(
    labels,
    collectMatches(
      text,
      /(?:三角形)\s*([A-Za-z]{3,})/g,
      splitCompactToken
    )
  );
  pushUnique(
    labels,
    collectMatches(
      text,
      /(?:线段|射线|角平分线|平分线|辅助线)\s*([A-Za-z]{2,})/g,
      splitCompactToken
    )
  );
  pushUnique(
    labels,
    collectMatches(text, /直线\s*([A-Za-z][A-Za-z0-9]*)/g, (token) => [token])
  );
  pushUnique(
    labels,
    collectMatches(text, /(?:圆心|圆)\s*([A-Za-z][A-Za-z0-9]*)/g, (token) => [
      token
    ])
  );

  return labels;
};

const buildScopedCanvasLinks = (
  scope: "summary" | "warning",
  items: string[]
): ChatStudioCanvasLink[] =>
  items.flatMap((text, index) => {
    const objectLabels = extractObjectLabelsFromText(text);
    if (objectLabels.length === 0) {
      return [];
    }

    return [
      {
        id: `${scope}_${index + 1}`,
        scope,
        text,
        objectLabels
      }
    ];
  });

const buildUncertaintyCanvasLinks = (
  items: ChatStudioUncertaintyItem[]
): ChatStudioCanvasLink[] =>
  items.flatMap((item) => {
    const objectLabels = extractObjectLabelsFromText(item.label);
    if (objectLabels.length === 0) {
      return [];
    }

    return [
      {
        id: `uncertainty_${item.id}`,
        scope: "uncertainty",
        text: item.label,
        objectLabels,
        uncertaintyId: item.id
      }
    ];
  });

export const buildStudioCanvasLinks = (
  input: BuildStudioCanvasLinksInput
): ChatStudioCanvasLink[] => [
  ...buildScopedCanvasLinks("summary", input.summaryItems),
  ...buildScopedCanvasLinks("warning", input.warningItems),
  ...buildUncertaintyCanvasLinks(input.uncertaintyItems)
];
