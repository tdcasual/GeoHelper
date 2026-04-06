import type { Artifact } from "@geohelper/agent-protocol";

export interface RuntimeEvalScorecard {
  evaluator: string;
  status: "passed" | "failed";
  passed: boolean;
  score: number;
  summary: string[];
  warnings: string[];
  nextActions: string[];
}

export interface CreateEvaluationArtifactInput {
  artifactId: string;
  runId: string;
  scorecard: RuntimeEvalScorecard;
  createdAt: string;
}

export const createEvaluationArtifact = ({
  artifactId,
  runId,
  scorecard,
  createdAt
}: CreateEvaluationArtifactInput): Artifact => ({
  id: artifactId,
  runId,
  kind: "evaluation",
  contentType: "application/json",
  storage: "inline",
  inlineData: scorecard,
  metadata: {
    evaluator: scorecard.evaluator,
    status: scorecard.status,
    passed: scorecard.passed
  },
  createdAt
});
