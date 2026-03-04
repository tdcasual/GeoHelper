import { CompileInput, RequestCommandBatch } from "./litellm-client";

export const compileToCommandBatch = async (
  input: CompileInput,
  requestCommandBatch: RequestCommandBatch
): Promise<unknown> => requestCommandBatch(input);
