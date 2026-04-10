import fs from "node:fs";
import path from "node:path";

export const loadBudgetConfig = () => ({
  maxComponentLines: 500,
  maxStoreLines: 600,
  maxModuleLines: 500,
  maxStyleLines: 700,
  maxTestLines: 600,
  requiredHotspots: []
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
const TEST_FILE_PATTERNS = [
  /\.test\.(ts|tsx|js|jsx|css)$/,
  /\.spec\.(ts|tsx|js|jsx|css)$/
];
const IGNORED_INCLUDE_TEST_HOTSPOTS = new Set([
  "apps/control-plane/test/delegation-sessions-route.test.ts",
  "apps/worker/test/run-loop-subagent.test.ts",
  "apps/worker/test/run-loop.test.ts",
  "packages/agent-store/test/run-store.test.ts"
]);

export const isTestFile = (filePath) =>
  TEST_FILE_PATTERNS.some((pattern) => pattern.test(filePath)) ||
  filePath.includes("/src/test/");

export const classifyFile = (filePath) => {
  if (isTestFile(filePath)) {
    return "test";
  }
  if (filePath.includes("/components/")) {
    return "component";
  }
  if (filePath.includes("/state/")) {
    return "store";
  }
  if (
    filePath.includes("/runtime/") ||
    filePath.includes("/storage/") ||
    filePath.includes("/routes/") ||
    filePath.includes("/services/")
  ) {
    return "module";
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
  if (category === "module") {
    return budgets.maxModuleLines;
  }
  if (category === "style") {
    return budgets.maxStyleLines;
  }
  if (category === "test") {
    return budgets.maxTestLines;
  }
  return null;
};

export const resolveBudgetCategory = (filePath, category) => {
  if (category !== "test") {
    return category;
  }
  return "test";
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

export const collectHotspots = ({
  cwd,
  budgets = loadBudgetConfig(),
  includeTests = false
}) =>
  walkFiles(cwd)
    .map((filePath) => {
      const category = classifyFile(filePath);
      if (category === "test" && !includeTests) {
        return null;
      }
      if (includeTests && IGNORED_INCLUDE_TEST_HOTSPOTS.has(filePath)) {
        return null;
      }

      const budgetCategory = resolveBudgetCategory(filePath, category);
      const budget = resolveBudget(budgetCategory, budgets);
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

export const renderHotspotReport = ({
  cwd,
  budgets = loadBudgetConfig(),
  includeTests = false
}) => {
  const hotspots = collectHotspots({ cwd, budgets, includeTests });
  const lines = [
    "GeoHelper maintainability hotspot report",
    "",
    `Budgets: component<=${budgets.maxComponentLines}, store<=${budgets.maxStoreLines}, module<=${budgets.maxModuleLines}, style<=${budgets.maxStyleLines}, test<=${budgets.maxTestLines}`,
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
  process.stdout.write(
    `${renderHotspotReport({
      cwd: process.cwd(),
      includeTests: process.argv.includes("--include-tests")
    })}\n`
  );
}
