import { CommandBatch, CommandBatchSchema } from "@geohelper/protocol";

export class InvalidCommandBatchError extends Error {
  public readonly issues: string[];

  constructor(issues: string[]) {
    super("INVALID_COMMAND_BATCH");
    this.issues = issues;
  }
}

export const verifyCommandBatch = (value: unknown): CommandBatch => {
  const result = CommandBatchSchema.safeParse(value);

  if (!result.success) {
    const issues = result.error.issues.map((issue) =>
      issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message
    );
    throw new InvalidCommandBatchError(issues);
  }

  return result.data;
};
