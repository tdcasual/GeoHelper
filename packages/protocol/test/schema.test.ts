import { describe, expect, it } from "vitest";

import { CommandBatchSchema } from "../src/schema";

describe("CommandBatchSchema", () => {
  it("rejects unknown operation", () => {
    const result = CommandBatchSchema.safeParse({
      version: "1.0",
      scene_id: "s1",
      transaction_id: "t1",
      commands: [
        {
          id: "c1",
          op: "eval_js",
          args: {},
          depends_on: [],
          idempotency_key: "k1"
        }
      ],
      post_checks: [],
      explanations: []
    });

    expect(result.success).toBe(false);
  });
});
