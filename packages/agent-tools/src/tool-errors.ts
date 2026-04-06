export class ToolRunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolRunnerError";
  }
}

export const createToolRunnerError = (message: string): ToolRunnerError =>
  new ToolRunnerError(message);
