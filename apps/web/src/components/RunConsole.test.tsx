import type {
  Artifact,
  Checkpoint,
  Run,
  RunEvent
} from "@geohelper/agent-protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RunConsole } from "./RunConsole";

const run: Run = {
  id: "run_1",
  threadId: "thread_1",
  profileId: "platform_geometry_standard",
  status: "waiting_for_checkpoint",
  inputArtifactIds: ["artifact_input_1"],
  outputArtifactIds: [],
  budget: {
    maxModelCalls: 6,
    maxToolCalls: 8,
    maxDurationMs: 120000
  },
  createdAt: "2026-04-04T00:00:00.000Z",
  updatedAt: "2026-04-04T00:00:00.000Z"
};

const events: RunEvent[] = [
  {
    id: "event_1",
    runId: "run_1",
    sequence: 1,
    type: "run.created",
    payload: {},
    createdAt: "2026-04-04T00:00:00.000Z"
  }
];

const pendingCheckpoint: Checkpoint = {
  id: "checkpoint_1",
  runId: "run_1",
  nodeId: "node_teacher_checkpoint",
  kind: "human_input",
  status: "pending",
  title: "Confirm geometry draft",
  prompt: "请确认是否继续执行。",
  createdAt: "2026-04-04T00:00:00.000Z"
};

const resolvedCheckpoint: Checkpoint = {
  ...pendingCheckpoint,
  status: "resolved",
  response: {
    approved: true
  },
  resolvedAt: "2026-04-04T00:01:00.000Z"
};

const artifacts: Artifact[] = [
  {
    id: "artifact_draft_1",
    runId: "run_1",
    kind: "draft",
    contentType: "application/json",
    storage: "inline",
    metadata: {},
    inlineData: {
      title: "初版草案"
    },
    createdAt: "2026-04-04T00:00:00.000Z"
  },
  {
    id: "artifact_canvas_1",
    runId: "run_1",
    kind: "canvas_evidence",
    contentType: "application/json",
    storage: "inline",
    metadata: {},
    inlineData: {
      snapshot: "scene_1"
    },
    createdAt: "2026-04-04T00:00:30.000Z"
  },
  {
    id: "artifact_draft_2",
    runId: "run_1",
    kind: "draft",
    contentType: "application/json",
    storage: "inline",
    metadata: {},
    inlineData: {
      title: "修正版草案"
    },
    createdAt: "2026-04-04T00:01:00.000Z"
  }
];

describe("RunConsole", () => {
  it("updates checkpoint UI and shows the latest draft with canvas evidence", () => {
    const pendingMarkup = renderToStaticMarkup(
      <RunConsole
        run={run}
        events={events}
        checkpoints={[pendingCheckpoint]}
        artifacts={artifacts}
      />
    );
    const resolvedMarkup = renderToStaticMarkup(
      <RunConsole
        run={{
          ...run,
          status: "completed"
        }}
        events={[
          ...events,
          {
            id: "event_2",
            runId: "run_1",
            sequence: 2,
            type: "checkpoint.resolved",
            payload: {},
            createdAt: "2026-04-04T00:01:00.000Z"
          }
        ]}
        checkpoints={[resolvedCheckpoint]}
        artifacts={artifacts}
      />
    );

    expect(pendingMarkup).toContain("Confirm geometry draft");
    expect(pendingMarkup).toContain("platform_geometry_standard");
    expect(resolvedMarkup).toContain("暂无待处理 checkpoint");
    expect(resolvedMarkup).toContain("修正版草案");
    expect(resolvedMarkup).toContain("scene_1");
  });
});
