import type { Artifact } from "@geohelper/agent-protocol";

interface ArtifactViewerProps {
  artifacts: Artifact[];
}

const byCreatedAt = (left: Artifact, right: Artifact): number =>
  left.createdAt.localeCompare(right.createdAt);

const readInlineLabel = (artifact: Artifact | undefined): string => {
  if (!artifact?.inlineData || typeof artifact.inlineData !== "object") {
    return "暂无";
  }

  if ("title" in artifact.inlineData) {
    return String(artifact.inlineData.title);
  }

  if ("snapshot" in artifact.inlineData) {
    return String(artifact.inlineData.snapshot);
  }

  return JSON.stringify(artifact.inlineData);
};

export const ArtifactViewer = ({ artifacts }: ArtifactViewerProps) => {
  const latestDraft = artifacts
    .filter((artifact) => artifact.kind === "draft")
    .sort(byCreatedAt)
    .at(-1);
  const latestCanvasEvidence = artifacts
    .filter((artifact) => artifact.kind === "canvas_evidence")
    .sort(byCreatedAt)
    .at(-1);

  return (
    <section className="run-console-card" data-testid="artifact-viewer">
      <h3>Artifact Viewer</h3>
      <p>最新草案：{readInlineLabel(latestDraft)}</p>
      <p>画布证据：{readInlineLabel(latestCanvasEvidence)}</p>
    </section>
  );
};
