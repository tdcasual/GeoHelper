import { describe, expect, it } from "vitest";

import { executeBatch } from "./command-executor";

describe("executeBatch", () => {
  it("rejects non-whitelisted operation", async () => {
    await expect(
      executeBatch({
        version: "1.0",
        scene_id: "s1",
        transaction_id: "t1",
        commands: [
          {
            id: "1",
            op: "eval_js" as never,
            args: {},
            depends_on: [],
            idempotency_key: "k"
          }
        ],
        post_checks: [],
        explanations: []
      })
    ).rejects.toThrow("Unsupported op");
  });
});
