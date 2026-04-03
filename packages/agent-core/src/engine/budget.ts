import type { Run, WorkflowNodeKind } from "@geohelper/agent-protocol";

export interface WorkflowBudgetUsage {
  modelCalls: number;
  toolCalls: number;
}

export interface WorkflowBudgetFailure {
  ok: false;
  reason: "model_budget_exhausted" | "tool_budget_exhausted";
}

export interface WorkflowBudgetSuccess {
  ok: true;
  usage: WorkflowBudgetUsage;
}

export type WorkflowBudgetResult = WorkflowBudgetFailure | WorkflowBudgetSuccess;

export const createBudgetUsage = (): WorkflowBudgetUsage => ({
  modelCalls: 0,
  toolCalls: 0
});

export const consumeBudgetForNodeKind = (
  run: Run,
  kind: WorkflowNodeKind,
  usage: WorkflowBudgetUsage
): WorkflowBudgetResult => {
  if (kind === "model") {
    if (usage.modelCalls >= run.budget.maxModelCalls) {
      return {
        ok: false,
        reason: "model_budget_exhausted"
      };
    }

    return {
      ok: true,
      usage: {
        ...usage,
        modelCalls: usage.modelCalls + 1
      }
    };
  }

  if (kind === "tool") {
    if (usage.toolCalls >= run.budget.maxToolCalls) {
      return {
        ok: false,
        reason: "tool_budget_exhausted"
      };
    }

    return {
      ok: true,
      usage: {
        ...usage,
        toolCalls: usage.toolCalls + 1
      }
    };
  }

  return {
    ok: true,
    usage
  };
};
