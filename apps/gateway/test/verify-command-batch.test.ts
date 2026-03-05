import { describe, expect, it } from "vitest";

import {
  InvalidCommandBatchError,
  verifyCommandBatch
} from "../src/services/verify-command-batch";

describe("verify-command-batch", () => {
  it("accepts valid full-domain command batch", () => {
    const batch = verifyCommandBatch({
      version: "1.0",
      scene_id: "scene_1",
      transaction_id: "tx_1",
      commands: [
        {
          id: "p1",
          op: "create_point",
          args: { name: "A", x: 0, y: 1 },
          depends_on: [],
          idempotency_key: "k1"
        },
        {
          id: "s1",
          op: "create_slider",
          args: { name: "t", min: 0, max: 360, step: 1 },
          depends_on: [],
          idempotency_key: "k2"
        },
        {
          id: "c1",
          op: "run_cas",
          args: { expression: "Solve(x^2-5x+6=0)" },
          depends_on: ["p1"],
          idempotency_key: "k3"
        },
        {
          id: "prob1",
          op: "run_probability_tool",
          args: { distribution: "Normal" },
          depends_on: ["s1"],
          idempotency_key: "k4"
        }
      ],
      post_checks: [],
      explanations: []
    });

    expect(batch.commands).toHaveLength(4);
  });

  it("rejects duplicate command ids", () => {
    expect(() =>
      verifyCommandBatch({
        version: "1.0",
        scene_id: "scene_1",
        transaction_id: "tx_1",
        commands: [
          {
            id: "dup",
            op: "create_point",
            args: { name: "A", x: 0, y: 0 },
            depends_on: [],
            idempotency_key: "k1"
          },
          {
            id: "dup",
            op: "create_line",
            args: { from: "A", to: "B" },
            depends_on: [],
            idempotency_key: "k2"
          }
        ],
        post_checks: [],
        explanations: []
      })
    ).toThrow(InvalidCommandBatchError);
  });

  it("rejects dependency on unknown command", () => {
    try {
      verifyCommandBatch({
        version: "1.0",
        scene_id: "scene_1",
        transaction_id: "tx_1",
        commands: [
          {
            id: "line_1",
            op: "create_line",
            args: { from: "A", to: "B" },
            depends_on: ["missing_1"],
            idempotency_key: "k1"
          }
        ],
        post_checks: [],
        explanations: []
      });
      throw new Error("expected InvalidCommandBatchError");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCommandBatchError);
      expect((error as InvalidCommandBatchError).issues.join("\n")).toMatch(
        /unknown dependency/i
      );
    }
  });

  it("rejects forward dependency order that cannot be executed sequentially", () => {
    try {
      verifyCommandBatch({
        version: "1.0",
        scene_id: "scene_1",
        transaction_id: "tx_1",
        commands: [
          {
            id: "line_1",
            op: "create_line",
            args: { from: "A", to: "B" },
            depends_on: ["point_1"],
            idempotency_key: "k1"
          },
          {
            id: "point_1",
            op: "create_point",
            args: { name: "A", x: 0, y: 0 },
            depends_on: [],
            idempotency_key: "k2"
          }
        ],
        post_checks: [],
        explanations: []
      });
      throw new Error("expected InvalidCommandBatchError");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCommandBatchError);
      expect((error as InvalidCommandBatchError).issues.join("\n")).toMatch(
        /dependency order/i
      );
    }
  });

  it("rejects invalid slider range", () => {
    try {
      verifyCommandBatch({
        version: "1.0",
        scene_id: "scene_1",
        transaction_id: "tx_1",
        commands: [
          {
            id: "slider_1",
            op: "create_slider",
            args: { name: "t", min: 10, max: 1, step: 1 },
            depends_on: [],
            idempotency_key: "k1"
          }
        ],
        post_checks: [],
        explanations: []
      });
      throw new Error("expected InvalidCommandBatchError");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCommandBatchError);
      expect((error as InvalidCommandBatchError).issues.join("\n")).toMatch(
        /min must be smaller than max/i
      );
    }
  });

  it("rejects unsupported probability distribution", () => {
    try {
      verifyCommandBatch({
        version: "1.0",
        scene_id: "scene_1",
        transaction_id: "tx_1",
        commands: [
          {
            id: "prob_1",
            op: "run_probability_tool",
            args: { distribution: "UnsupportedDist" },
            depends_on: [],
            idempotency_key: "k1"
          }
        ],
        post_checks: [],
        explanations: []
      });
      throw new Error("expected InvalidCommandBatchError");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCommandBatchError);
      expect((error as InvalidCommandBatchError).issues.join("\n")).toMatch(
        /unsupported distribution/i
      );
    }
  });
});
