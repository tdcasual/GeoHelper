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

  const issues: string[] = [];
  const commands = result.data.commands;
  const commandIndexById = new Map<string, number>();

  const asFiniteNumber = (input: unknown): number | null => {
    const value = typeof input === "number" ? input : Number(input);
    return Number.isFinite(value) ? value : null;
  };
  const asText = (input: unknown): string =>
    typeof input === "string" ? input.trim() : "";
  const blockedExpressionPattern =
    /\b(DeleteAll|Execute|RunScript|JavaScript|eval_js)\b/i;
  const allowedProbabilityDistributions = new Set([
    "Normal",
    "Binomial",
    "Poisson",
    "Geometric",
    "HyperGeometric",
    "Uniform",
    "Exponential"
  ]);

  const pushIssue = (index: number, message: string): void => {
    issues.push(`commands.${index}: ${message}`);
  };

  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    if (commandIndexById.has(command.id)) {
      pushIssue(
        index,
        `duplicate command id "${command.id}" (first at ${commandIndexById.get(
          command.id
        )})`
      );
      continue;
    }
    commandIndexById.set(command.id, index);
  }

  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    for (const depId of command.depends_on) {
      if (depId === command.id) {
        pushIssue(index, `self dependency is not allowed (${depId})`);
        continue;
      }
      const depIndex = commandIndexById.get(depId);
      if (depIndex == null) {
        pushIssue(index, `unknown dependency "${depId}"`);
        continue;
      }
      if (depIndex >= index) {
        pushIssue(
          index,
          `dependency order invalid: "${depId}" appears after current command`
        );
      }
    }
  }

  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    const args = command.args as Record<string, unknown>;
    switch (command.op) {
      case "create_point": {
        const name = asText(args.name);
        const x = asFiniteNumber(args.x);
        const y = asFiniteNumber(args.y);
        if (!name) {
          pushIssue(index, "create_point args.name is required");
        }
        if (x == null || y == null) {
          pushIssue(index, "create_point args.x/args.y must be finite numbers");
        }
        break;
      }
      case "create_line": {
        const from = asText(args.from);
        const to = asText(args.to);
        if (!from || !to) {
          pushIssue(index, "create_line args.from/args.to are required");
        } else if (from === to) {
          pushIssue(index, "create_line args.from and args.to must be different");
        }
        break;
      }
      case "create_conic": {
        const center = asText(args.center);
        const radius = asFiniteNumber(args.radius);
        if (!center) {
          pushIssue(index, "create_conic args.center is required");
        }
        if (radius == null || radius <= 0) {
          pushIssue(index, "create_conic args.radius must be > 0");
        }
        break;
      }
      case "set_property": {
        const name = asText(args.name);
        const value = asFiniteNumber(args.value);
        if (!name) {
          pushIssue(index, "set_property args.name is required");
        }
        if (value == null) {
          pushIssue(index, "set_property args.value must be a finite number");
        }
        break;
      }
      case "create_slider": {
        const name = asText(args.name);
        const min = asFiniteNumber(args.min);
        const max = asFiniteNumber(args.max);
        const step = asFiniteNumber(args.step);
        if (!name) {
          pushIssue(index, "create_slider args.name is required");
        }
        if (min == null || max == null || step == null) {
          pushIssue(index, "create_slider args.min/max/step must be finite numbers");
          break;
        }
        if (min >= max) {
          pushIssue(index, "create_slider min must be smaller than max");
        }
        if (step <= 0) {
          pushIssue(index, "create_slider step must be > 0");
        }
        break;
      }
      case "create_3d_object": {
        const expression = asText(args.expression);
        if (!expression) {
          pushIssue(index, "create_3d_object args.expression is required");
          break;
        }
        if (expression.length > 500) {
          pushIssue(index, "create_3d_object expression too long");
        }
        if (blockedExpressionPattern.test(expression)) {
          pushIssue(index, "create_3d_object expression contains blocked token");
        }
        break;
      }
      case "run_cas": {
        const expression = asText(args.expression);
        if (!expression) {
          pushIssue(index, "run_cas args.expression is required");
          break;
        }
        if (expression.length > 500) {
          pushIssue(index, "run_cas expression too long");
        }
        if (blockedExpressionPattern.test(expression)) {
          pushIssue(index, "run_cas expression contains blocked token");
        }
        break;
      }
      case "run_probability_tool": {
        const distribution = asText(args.distribution);
        if (!distribution) {
          pushIssue(index, "run_probability_tool args.distribution is required");
          break;
        }
        if (!allowedProbabilityDistributions.has(distribution)) {
          pushIssue(
            index,
            `run_probability_tool unsupported distribution "${distribution}"`
          );
        }
        break;
      }
      default:
        break;
    }
  }

  if (issues.length > 0) {
    throw new InvalidCommandBatchError(issues);
  }

  return result.data;
};
