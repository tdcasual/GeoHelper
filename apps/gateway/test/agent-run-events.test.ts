import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { createMemoryCompileEventSink } from "../src/services/compile-events";
import { clearRateLimits } from "../src/services/rate-limit";
import {
  createGeometryAgentResponder,
  createGeometryDraftFixture,
  createGeometryReviewFixture
} from "./helpers/geometry-agent-stub";

describe("agent run events", () => {
  it("still returns INVALID_REQUEST when validation event writes fail", async () => {
    clearRateLimits();

    const app = buildServer(
      {},
      {
        compileEventSink: {
          write: async () => {
            throw new Error("sink offline");
          }
        }
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: {}
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload)).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Request payload is invalid"
      }
    });
  });

  it("records validation failure for malformed requests", async () => {
    clearRateLimits();

    const compileEventSink = createMemoryCompileEventSink();
    const app = buildServer(
      {},
      {
        compileEventSink
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: {}
    });

    expect(res.statusCode).toBe(400);
    expect(compileEventSink.readAll()).toEqual([
      expect.objectContaining({
        event: "compile_validation_failure",
        finalStatus: "validation_failure",
        path: "/api/v2/agent/runs",
        detail: "invalid_request",
        statusCode: 400
      })
    ]);
  });

  it("records validation failure when attachments are unsupported", async () => {
    clearRateLimits();

    const compileEventSink = createMemoryCompileEventSink();
    const app = buildServer(
      {},
      {
        compileEventSink
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: {
        message: "根据图片画出三角形",
        mode: "byok",
        attachments: [
          {
            id: "img_1",
            kind: "image",
            name: "triangle.png",
            mimeType: "image/png",
            size: 1234,
            transportPayload: "data:image/png;base64,AAAA"
          }
        ]
      }
    });

    expect(res.statusCode).toBe(400);
    expect(compileEventSink.readAll()).toEqual([
      expect.objectContaining({
        event: "compile_validation_failure",
        finalStatus: "validation_failure",
        path: "/api/v2/agent/runs",
        mode: "byok",
        detail: "attachments_unsupported",
        statusCode: 400,
        metadata: expect.objectContaining({
          attachments_count: 1,
          attachment_kinds: ["image"]
        })
      })
    ]);
  });

  it("records agent run metadata on success", async () => {
    clearRateLimits();

    const compileEventSink = createMemoryCompileEventSink();
    const app = buildServer(
      {},
      {
        compileEventSink,
        requestCommandBatch: async (input) => {
          if (input.systemPrompt?.includes("GeometryDraftPackage")) {
            return {
              normalizedIntent: "构造中点",
              assumptions: [],
              constructionPlan: ["先取线段 AB", "再取中点 M"],
              namingPlan: ["A", "B", "M"],
              commandBatchDraft: {
                version: "1.0",
                scene_id: "scene_1",
                transaction_id: "tx_1",
                commands: [],
                explanations: ["草案"],
                post_checks: []
              },
              teachingOutline: ["说明中点定义"],
              reviewChecklist: ["检查 M 是否在线段 AB 上"]
            };
          }

          return {
            reviewer: "geometry-reviewer",
            verdict: "approve",
            summary: ["草案可执行"],
            correctnessIssues: [],
            ambiguityIssues: [],
            namingIssues: [],
            teachingIssues: [],
            repairInstructions: [],
            uncertaintyItems: []
          };
        }
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: {
        message: "作线段 AB 的中点 M",
        mode: "byok"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(compileEventSink.readAll()).toEqual([
      expect.objectContaining({
        event: "compile_success",
        finalStatus: "success",
        path: "/api/v2/agent/runs",
        metadata: expect.objectContaining({
          iterationCount: 1,
          reviewerVerdict: "approve",
          degraded: false
        })
      })
    ]);
  });

  it("records invalid command batches as validation failures without changing the v2 response envelope", async () => {
    clearRateLimits();

    const compileEventSink = createMemoryCompileEventSink();
    const app = buildServer(
      {},
      {
        compileEventSink,
        requestCommandBatch: createGeometryAgentResponder({
          drafts: [
            createGeometryDraftFixture({
              commandBatchDraft: {
                version: "1.0",
                scene_id: "scene_invalid",
                transaction_id: "tx_invalid",
                commands: [
                  {
                    id: "c1",
                    op: "create_line",
                    args: {
                      from: "A",
                      to: "A"
                    },
                    depends_on: [],
                    idempotency_key: "k1"
                  }
                ],
                post_checks: [],
                explanations: ["初稿包含无效命令"]
              }
            })
          ],
          reviews: [createGeometryReviewFixture()]
        })
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: {
        message: "作线段 AB 的中点 M",
        mode: "byok"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toMatchObject({
      trace_id: "tr_req-1",
      agent_run: {
        run: {
          status: "needs_review"
        },
        evidence: {
          preflight: {
            status: "failed"
          }
        }
      }
    });
    expect(compileEventSink.readAll()).toEqual([
      expect.objectContaining({
        event: "compile_validation_failure",
        finalStatus: "validation_failure",
        path: "/api/v2/agent/runs",
        mode: "byok",
        detail: "invalid_command_batch",
        statusCode: 200,
        metadata: expect.objectContaining({
          issues: expect.any(Array)
        })
      })
    ]);
  });

  it("still returns the v2 agent run envelope for invalid command batches when event writes fail", async () => {
    clearRateLimits();

    const app = buildServer(
      {},
      {
        compileEventSink: {
          write: async () => {
            throw new Error("sink offline");
          }
        },
        requestCommandBatch: createGeometryAgentResponder({
          drafts: [
            createGeometryDraftFixture({
              commandBatchDraft: {
                version: "1.0",
                scene_id: "scene_invalid",
                transaction_id: "tx_invalid",
                commands: [
                  {
                    id: "c1",
                    op: "create_line",
                    args: {
                      from: "A",
                      to: "A"
                    },
                    depends_on: [],
                    idempotency_key: "k1"
                  }
                ],
                post_checks: [],
                explanations: ["初稿包含无效命令"]
              }
            })
          ],
          reviews: [createGeometryReviewFixture()]
        })
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: {
        message: "作线段 AB 的中点 M",
        mode: "byok"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toMatchObject({
      trace_id: "tr_req-1",
      agent_run: {
        run: {
          status: "needs_review"
        },
        evidence: {
          preflight: {
            status: "failed"
          }
        }
      }
    });
  });

  it("still returns AGENT_WORKFLOW_FAILED when failure event writes fail", async () => {
    clearRateLimits();

    const app = buildServer(
      {},
      {
        compileEventSink: {
          write: async () => {
            throw new Error("sink offline");
          }
        },
        requestCommandBatch: async () => {
          throw new Error("upstream hard failure");
        }
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: {
        message: "作线段 AB 的中点 M",
        mode: "byok"
      }
    });

    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.payload)).toEqual({
      error: {
        code: "AGENT_WORKFLOW_FAILED",
        message: "upstream hard failure"
      }
    });
  });

  it("still returns a repaired v2 run when success events fail to write", async () => {
    clearRateLimits();

    const app = buildServer(
      {},
      {
        compileEventSink: {
          write: async () => {
            throw new Error("sink offline");
          }
        },
        requestCommandBatch: createGeometryAgentResponder({
          drafts: [
            createGeometryDraftFixture({
              commandBatchDraft: {
                version: "1.0",
                scene_id: "scene_repair_before",
                transaction_id: "tx_repair_before",
                commands: [
                  {
                    id: "c1",
                    op: "create_line",
                    args: {
                      from: "A",
                      to: "A"
                    },
                    depends_on: [],
                    idempotency_key: "k1"
                  }
                ],
                post_checks: [],
                explanations: []
              }
            }),
            createGeometryDraftFixture({
              commandBatchDraft: {
                version: "1.0",
                scene_id: "scene_repair_after",
                transaction_id: "tx_repair_after",
                commands: [],
                post_checks: [],
                explanations: []
              }
            })
          ],
          reviews: [
            createGeometryReviewFixture({
              verdict: "revise",
              summary: ["命令需要修复"],
              repairInstructions: ["重新生成一份可执行草案"]
            }),
            createGeometryReviewFixture()
          ]
        })
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: {
        message: "作线段 AB 的中点 M",
        mode: "byok"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toMatchObject({
      trace_id: "tr_req-1",
      agent_run: {
        run: {
          iterationCount: 2
        }
      }
    });
  });
});

describe("agent run repair events", () => {
  it("records compile_repair when the workflow needs one revise pass", async () => {
    clearRateLimits();

    const compileEventSink = createMemoryCompileEventSink();
    const app = buildServer(
      {},
      {
        compileEventSink,
        requestCommandBatch: createGeometryAgentResponder({
          drafts: [
            createGeometryDraftFixture({
              commandBatchDraft: {
                version: "1.0",
                scene_id: "scene_repair_before",
                transaction_id: "tx_repair_before",
                commands: [
                  {
                    id: "c1",
                    op: "create_line",
                    args: {
                      from: "A",
                      to: "A"
                    },
                    depends_on: [],
                    idempotency_key: "k1"
                  }
                ],
                post_checks: [],
                explanations: []
              }
            }),
            createGeometryDraftFixture({
              commandBatchDraft: {
                version: "1.0",
                scene_id: "scene_repair_after",
                transaction_id: "tx_repair_after",
                commands: [],
                post_checks: [],
                explanations: []
              }
            })
          ],
          reviews: [
            createGeometryReviewFixture({
              verdict: "revise",
              summary: ["命令需要修复"],
              repairInstructions: ["重新生成一份可执行草案"]
            }),
            createGeometryReviewFixture()
          ]
        })
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: {
        message: "作线段 AB 的中点 M",
        mode: "byok"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(compileEventSink.readAll()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "compile_success",
          finalStatus: "repair",
          path: "/api/v2/agent/runs",
          metadata: expect.objectContaining({
            iterationCount: 2,
            reviewerVerdict: "approve"
          })
        }),
        expect.objectContaining({
          event: "compile_repair",
          finalStatus: "repair",
          path: "/api/v2/agent/runs",
          detail: "repair agent produced a valid batch",
          metadata: expect.objectContaining({
            repair: true
          })
        })
      ])
    );
  });
});
