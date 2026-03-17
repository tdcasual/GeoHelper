import { type CompileInput } from "./litellm-client";

const quote = (value: string): string => JSON.stringify(value);

export const buildGeometryContextSuffix = (input: CompileInput): string => {
  const sections: string[] = [];

  if (input.context?.recentMessages?.length) {
    const recentMessages = input.context.recentMessages
      .slice(-8)
      .map(
        (item) =>
          `${item.role === "assistant" ? "Assistant" : "User"}: ${item.content}`
      );
    sections.push(`Recent conversation:\n${recentMessages.join("\n")}`);
  }

  if (input.context?.sceneTransactions?.length) {
    const recentTransactions = input.context.sceneTransactions
      .slice(0, 8)
      .map(
        (item) =>
          `${item.sceneId}/${item.transactionId}: ${item.commandCount} commands`
      );
    sections.push(`Recent scene transactions:\n${recentTransactions.join("\n")}`);
  }

  return sections.length > 0 ? `\n\n${sections.join("\n\n")}` : "";
};

export const buildGeometryRequestEnvelope = (
  role: "author" | "reviewer" | "reviser",
  sections: string[]
): string =>
  [
    `Return JSON only for the ${role} step of a geometry agent workflow.`,
    ...sections.filter(Boolean)
  ].join("\n\n");

export const serializeDraftSummary = (value: unknown): string => quote(JSON.stringify(value));
export const serializeIssueList = (items: string[]): string => quote(items.join("; "));
