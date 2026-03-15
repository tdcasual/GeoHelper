import fs from "node:fs";

const ACTIONABLE_PATTERNS = [
  "dynamic import will not move module into another chunk"
];

export const containsActionableBuildWarning = (line) =>
  ACTIONABLE_PATTERNS.some((pattern) => line.includes(pattern));

export const extractActionableBuildWarnings = (content) =>
  content
    .split(/\r?\n/)
    .filter((line) => containsActionableBuildWarning(line.trim()));

export const normalizeBuildWarning = (text) =>
  text
    .replaceAll("\\", "/")
    .replace(/\(\!\)\s*/g, "")
    .replace(
      /(?:[A-Za-z]:)?(?:\/[^,\s]+)+\/(?=apps\/|packages\/|tests\/|scripts\/|docs\/)/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

export const filterDocumentedBaselineWarnings = ({
  warnings,
  baselineContent
}) => {
  const normalizedBaseline = normalizeBuildWarning(baselineContent);

  return warnings.filter((warning) => {
    const normalizedWarning = normalizeBuildWarning(warning);
    return !normalizedBaseline.includes(normalizedWarning);
  });
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const logPath = process.argv[2] ?? process.env.BUILD_WARNING_LOG;
  const baselinePath = process.argv[3] ?? process.env.BUILD_WARNING_BASELINE;

  if (!logPath) {
    console.error(
      "Usage: node scripts/quality/check-build-warnings.mjs <build-log-path>"
    );
    process.exit(1);
  }

  const content = fs.readFileSync(logPath, "utf8");
  const warnings = extractActionableBuildWarnings(content);
  const filteredWarnings = baselinePath
    ? filterDocumentedBaselineWarnings({
        warnings,
        baselineContent: fs.readFileSync(baselinePath, "utf8")
      })
    : warnings;

  if (filteredWarnings.length === 0) {
    console.log("No actionable build warnings detected.");
    process.exit(0);
  }

  console.error("Actionable build warnings detected:");
  for (const warning of filteredWarnings) {
    console.error(`- ${warning}`);
  }
  process.exit(1);
}
