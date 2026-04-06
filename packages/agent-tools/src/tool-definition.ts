import type { ZodType } from "zod";

export type ToolKind =
  | "server_tool"
  | "worker_tool"
  | "browser_tool"
  | "external_tool";

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  kind: ToolKind;
  permissions: string[];
  retryable: boolean;
  timeoutMs?: number;
  redactPaths?: string[];
  inputSchema: ZodType<TInput>;
  outputSchema: ZodType<TOutput>;
  execute: (input: TInput) => Promise<TOutput> | TOutput;
}

export type AnyToolDefinition = ToolDefinition<any, any>;
