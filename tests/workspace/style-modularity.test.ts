import fs from "node:fs";

import { describe, expect, it } from "vitest";

const countLines = (filePath: string) =>
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).length;

describe("style modularity", () => {
  it("turns styles.css into an import hub", () => {
    const entry = fs.readFileSync("apps/web/src/styles.css", "utf8");

    expect(entry).toContain('@import "./styles/tokens.css";');
    expect(entry).toContain('@import "./styles/homepage.css";');
    expect(entry).toContain('@import "./styles/workspace-shell.css";');
    expect(entry).toContain('@import "./styles/chat.css";');
    expect(entry).toContain('@import "./styles/settings-drawer.css";');
    expect(entry).toContain('@import "./styles/responsive.css";');
    expect(countLines("apps/web/src/styles.css")).toBeLessThan(120);
  });
});
