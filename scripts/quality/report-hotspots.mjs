import fs from "node:fs";
import path from "node:path";

export const loadBudgetConfig = () => ({
  maxComponentLines: 500,
  maxStoreLines: 600,
  maxStyleLines: 700,
  requiredHotspots: [
    "apps/web/src/components/SettingsDrawer.tsx",
    "apps/web/src/components/WorkspaceShell.tsx",
    "apps/web/src/state/settings-store.ts",
    "apps/web/src/state/chat-store.ts",
    "apps/web/src/styles.css"
  ]
});

const IGNORE_DIRS = new Set([
  ".git",
  ".cache",
  ".playwright-cli",
  "coverage",
  "dist",
  "node_modules",
  "output",
  "public",
  "vendor"
]);

const SOURCE_EXTENSIONS = new Set([".css", ".ts", ".tsx"]);

export const classifyFile = (filePath) => {
  if (filePath.includes("/components/")) {
    return "component";
  }
  if (filePath.includes("/state/")) {
    return "store";
  }
  if (filePath.endsWith(".css")) {
    return "style";
  }
  return "other";
};

const resolveBudget = (category, budgets) => {
  if (category === "component") {
    return budgets.maxComponentLines;
  }
  if (category === "store") {
    return budgets.maxStoreLines;
  }
  if (category === "style") {
    return budgets.maxStyleLines;
  }
  return null;
};

const countLines = (text) => text.split(/\r?\n/).length;

const walkFiles = (cwd, relativeDir = "") => {
  const fullDir = path.join(cwd, relativeDir);
  const entries = fs.readdirSync(fullDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) {
      continue;
    }

    const nextRelativePath = relativeDir
      ? path.posix.join(relativeDir, entry.name)
      : entry.name;

    if (entry.isDirectory()) {
      files.push(...walkFiles(cwd, nextRelativePath));
      continue;
    }

    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    files.push(nextRelativePath);
  }

  return files;
};

export const collectHotspots = ({ cwd, budgets = loadBudgetConfig() }) =>
  walkFiles(cwd)
    .map((filePath) => {
      const category = classifyFile(filePath);
      const budget = resolveBudget(category, budgets);
      if (budget == null) {
        return null;
      }

      const contents = fs.readFileSync(path.join(cwd, filePath), "utf8");
      const lineCount = countLines(contents);
      if (lineCount <= budget) {
        return null;
      }

      return {
        filePath,
        category,
        lineCount,
        budget,
        overflow: lineCount - budget
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.lineCount - left.lineCount);

export const renderHotspotReport = ({ cwd, budgets = loadBudgetConfig() }) => {
  const hotspots = collectHotspots({ cwd, budgets });
  const lines = [
    "GeoHelper maintainability hotspot report",
    "",
    `Budgets: component<=${budgets.maxComponentLines}, store<=${budgets.maxStoreLines}, style<=${budgets.maxStyleLines}`,
    ""
  ];

  if (hotspots.length === 0) {
    lines.push("No over-budget files detected.");
    return lines.join("\n");
  }

  for (const hotspot of hotspots) {
    lines.push(
      `${hotspot.filePath} [${hotspot.category}] ${hotspot.lineCount} lines (budget ${hotspot.budget}, +${hotspot.overflow})`
    );
  }

  return lines.join("\n");
};

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${renderHotspotReport({ cwd: process.cwd() })}\n`);
}
