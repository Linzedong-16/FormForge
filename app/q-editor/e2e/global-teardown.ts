/**
 * Playwright 全局 Teardown — 覆盖率报告生成
 *
 * 合并所有测试中收集的覆盖率数据，生成 HTML 报告
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeCoverageReports } from "./fixtures/coverage.js";
import { generateSummary, generateHtmlReport } from "./fixtures/coverage-reporter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function globalTeardown() {
  const coverageDir = path.resolve(__dirname, ".coverage");
  console.log(`[Teardown] 覆盖率数据目录: ${coverageDir}`);

  // 1. 合并所有覆盖率数据
  const mergedPath = await mergeCoverageReports();

  if (mergedPath && fs.existsSync(mergedPath)) {
    try {
      // 2. 读取合并后的覆盖率数据
      const mergedData = JSON.parse(fs.readFileSync(mergedPath, "utf-8"));

      // 3. 生成摘要
      const summary = generateSummary(mergedData);

      console.log(`[Teardown] 覆盖率摘要:`);
      console.log(`  语句: ${summary.statements.pct}% (${summary.statements.covered}/${summary.statements.total})`);
      console.log(`  分支: ${summary.branches.pct}% (${summary.branches.covered}/${summary.branches.total})`);
      console.log(`  函数: ${summary.functions.pct}% (${summary.functions.covered}/${summary.functions.total})`);
      console.log(`  行:   ${summary.lines.pct}% (${summary.lines.covered}/${summary.lines.total})`);
      console.log(`  文件: ${summary.files.length}`);

      // 4. 生成 HTML 报告
      const reportPath = path.resolve(__dirname, "test-results", "coverage-report.html");
      generateHtmlReport(summary, reportPath);

      // 5. 生成 JSON 摘要报告
      const jsonReportPath = path.resolve(__dirname, "test-results", "coverage-summary.json");
      fs.writeFileSync(jsonReportPath, JSON.stringify(summary, null, 2), "utf-8");
      console.log(`[Teardown] JSON 摘要已生成: ${jsonReportPath}`);
    } catch (err) {
      console.error("[Teardown] 生成覆盖率报告失败:", err instanceof Error ? err.message : err);
    }
  } else {
    console.log("[Teardown] 没有覆盖率数据可生成报告");
  }
}

export default globalTeardown;
