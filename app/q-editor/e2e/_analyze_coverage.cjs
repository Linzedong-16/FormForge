const fs = require("fs");
const path = require("path");

// Use E2E coverage summary
const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, "test-results/coverage-summary.json"), "utf-8"));

const files = data.files;

// Sort by line coverage (lowest first)
const sorted = files
  .filter(f => f.lines.total > 0)
  .sort((a, b) => {
    const aPct = a.lines.pct || 0;
    const bPct = b.lines.pct || 0;
    return aPct - bPct;
  });

console.log("=== E2E 覆盖率总览 ===");
console.log(`Lines: ${data.lines.pct}%`);
console.log(`Functions: ${data.functions.pct}%`);
console.log(`Branches: ${data.branches.pct}%`);
console.log(`Total files: ${files.length}`);
console.log("");

// Group by directory
const byDir = {};
sorted.forEach(f => {
  const dir = f.relativePath.split("/").slice(0, -1).join("/") || "root";
  if (!byDir[dir]) byDir[dir] = [];
  byDir[dir].push(f);
});

console.log("=== 按目录分组的覆盖率 (从低到高) ===\n");
Object.entries(byDir).forEach(([dir, dirFiles]) => {
  const avgLines = dirFiles.reduce((sum, f) => sum + (f.lines.pct || 0), 0) / dirFiles.length;
  console.log(`\n[${dir}] (${dirFiles.length} files, avg lines: ${avgLines.toFixed(1)}%)`);
  dirFiles.forEach(f => {
    const name = f.relativePath.split("/").pop();
    const lPct = (f.lines.pct || 0).toFixed(1) + "%";
    const bPct = (f.branches.pct || 0).toFixed(1) + "%";
    const fPct = (f.functions.pct || 0).toFixed(1) + "%";
    console.log(
      `  ${name.padEnd(35)} L: ${lPct.padStart(7)}  B: ${bPct.padStart(7)}  F: ${fPct.padStart(7)}  (${f.lines.total} lines)`
    );
  });
});

// Identify core business logic files with low coverage
console.log("\n\n=== 核心业务逻辑低覆盖率文件 (< 80%) ===");
const corePatterns = ["stores/", "utils/", "composables/", "api/", "db/", "directives/"];
const coreLow = sorted.filter(f => {
  const pct = f.lines.pct || 0;
  const isCore = corePatterns.some(p => f.relativePath.includes(p));
  return isCore && pct < 80;
});
console.log(`共 ${coreLow.length} 个核心模块文件覆盖率不足 80%`);
coreLow.forEach(f => {
  const lPct = (f.lines.pct || 0).toFixed(1) + "%";
  const bPct = (f.branches.pct || 0).toFixed(1) + "%";
  const fPct = (f.functions.pct || 0).toFixed(1) + "%";
  console.log(
    `  ${f.relativePath.padEnd(50)} L: ${lPct.padStart(7)}  B: ${bPct.padStart(7)}  F: ${fPct.padStart(7)}  (${f.lines.total} lines)`
  );
});
