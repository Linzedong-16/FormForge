/**
 * 覆盖率报告生成器
 *
 * 从 Istanbul 格式的覆盖率数据中生成 HTML 报告
 */
import fs from "node:fs";
import path from "node:path";

interface CoverageStats {
  total: number;
  covered: number;
  skipped: number;
  pct: number;
}

interface FileCoverage {
  file: string;
  relativePath: string;
  lines: CoverageStats;
  statements: CoverageStats;
  functions: CoverageStats;
  branches: CoverageStats;
}

interface CoverageSummary {
  lines: CoverageStats;
  statements: CoverageStats;
  functions: CoverageStats;
  branches: CoverageStats;
  files: FileCoverage[];
}

/**
 * 从 Istanbul 覆盖率数据生成统计摘要
 */
function generateSummary(coverageData: Record<string, unknown>): CoverageSummary {
  const files: FileCoverage[] = [];
  const summary: CoverageSummary = {
    lines: { total: 0, covered: 0, skipped: 0, pct: 0 },
    statements: { total: 0, covered: 0, skipped: 0, pct: 0 },
    functions: { total: 0, covered: 0, skipped: 0, pct: 0 },
    branches: { total: 0, covered: 0, skipped: 0, pct: 0 },
    files: []
  };

  const projectRoot = path.resolve(process.cwd(), "src");

  for (const [filePath, data] of Object.entries(coverageData)) {
    const d = data as Record<string, unknown>;
    const s = d.s as Record<string, number> | undefined;
    const b = d.b as Record<string, number[]> | undefined;
    const f = d.f as Record<string, number> | undefined;
    const statementMap = d.statementMap as Record<string, unknown> | undefined;

    if (!s && !b && !f) continue;

    // 语句覆盖率
    const stmtStats = calcStats(s || {});
    // 分支覆盖率
    const branchStats = calcBranchStats(b || {});
    // 函数覆盖率
    const funcStats = calcStats(f || {});

    const relativePath = filePath.replace(/^.*?src[\\/]/, "src/");

    const fileStats: FileCoverage = {
      file: filePath,
      relativePath,
      lines: stmtStats,
      statements: stmtStats,
      functions: funcStats,
      branches: branchStats
    };

    files.push(fileStats);

    summary.statements.total += stmtStats.total;
    summary.statements.covered += stmtStats.covered;
    summary.lines.total += stmtStats.total;
    summary.lines.covered += stmtStats.covered;
    summary.functions.total += funcStats.total;
    summary.functions.covered += funcStats.covered;
    summary.branches.total += branchStats.total;
    summary.branches.covered += branchStats.covered;
  }

  // 计算百分比
  calcPct(summary.lines);
  calcPct(summary.statements);
  calcPct(summary.functions);
  calcPct(summary.branches);

  summary.files = files.sort((a, b) => a.statements.pct - b.statements.pct);

  return summary;
}

function calcStats(map: Record<string, number>): CoverageStats {
  let total = 0;
  let covered = 0;
  for (const count of Object.values(map)) {
    total++;
    if (count > 0) covered++;
  }
  const stats: CoverageStats = { total, covered, skipped: total - covered, pct: 0 };
  // 单文件百分比需在此处计算，此前遗漏导致每个文件的 pct 始终为 0
  calcPct(stats);
  return stats;
}

function calcBranchStats(map: Record<string, number[]>): CoverageStats {
  let total = 0;
  let covered = 0;
  for (const counts of Object.values(map)) {
    for (const count of counts) {
      total++;
      if (count > 0) covered++;
    }
  }
  const stats: CoverageStats = { total, covered, skipped: total - covered, pct: 0 };
  calcPct(stats);
  return stats;
}

function calcPct(stats: CoverageStats) {
  stats.pct = stats.total === 0 ? 100 : Math.round((stats.covered / stats.total) * 10000) / 100;
}

function colorForPct(pct: number): string {
  if (pct >= 80) return "#22c55e";
  if (pct >= 50) return "#eab308";
  return "#ef4444";
}

function barForPct(pct: number): string {
  return `<div class="bar-bg"><div class="bar-fill" style="width:${pct}%;background:${colorForPct(pct)}"></div></div>`;
}

/**
 * 生成 HTML 覆盖率报告
 */
export function generateHtmlReport(summary: CoverageSummary, outputPath: string) {
  const filesHtml = summary.files
    .map(
      f => `
    <tr>
      <td class="file-name">${escapeHtml(f.relativePath)}</td>
      <td class="num">${f.statements.pct}%</td>
      <td>${barForPct(f.statements.pct)}</td>
      <td class="num">${f.statements.covered}/${f.statements.total}</td>
      <td class="num">${f.branches.pct}%</td>
      <td>${barForPct(f.branches.pct)}</td>
      <td class="num">${f.branches.covered}/${f.branches.total}</td>
      <td class="num">${f.functions.pct}%</td>
      <td>${barForPct(f.functions.pct)}</td>
      <td class="num">${f.functions.covered}/${f.functions.total}</td>
      <td class="num">${f.lines.pct}%</td>
      <td>${barForPct(f.lines.pct)}</td>
      <td class="num">${f.lines.covered}/${f.lines.total}</td>
    </tr>`
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>E2E 测试覆盖率报告</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 40px; }
    .header h1 { font-size: 24px; margin-bottom: 8px; }
    .header .meta { font-size: 14px; opacity: 0.85; }
    .summary { display: flex; gap: 20px; padding: 20px 40px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .summary-card { flex: 1; text-align: center; padding: 16px; border-radius: 8px; background: #f8f9fa; }
    .summary-card .pct { font-size: 32px; font-weight: 700; margin-bottom: 4px; }
    .summary-card .label { font-size: 13px; color: #666; }
    .summary-card .frac { font-size: 12px; color: #999; margin-top: 4px; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px 40px; }
    .section-title { font-size: 18px; font-weight: 600; margin: 24px 0 12px; color: #444; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th { background: #f8f9fa; padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #666; text-transform: uppercase; border-bottom: 2px solid #e9ecef; }
    td { padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
    .file-name { font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .num { text-align: right; font-variant-numeric: tabular-nums; min-width: 60px; }
    .bar-bg { width: 80px; height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
    .footer { text-align: center; padding: 20px; color: #999; font-size: 12px; }
    .passed { color: #22c55e; }
    .warning { color: #eab308; }
    .failed { color: #ef4444; }
  </style>
</head>
<body>
  <div class="header">
    <h1>E2E 测试覆盖率报告</h1>
    <div class="meta">生成时间: ${new Date().toLocaleString("zh-CN")} | q-editor 前端 E2E 测试</div>
  </div>

  <div class="summary">
    <div class="summary-card">
      <div class="pct" style="color:${colorForPct(summary.statements.pct)}">${summary.statements.pct}%</div>
      <div class="label">语句覆盖率 (Statements)</div>
      <div class="frac">${summary.statements.covered} / ${summary.statements.total}</div>
    </div>
    <div class="summary-card">
      <div class="pct" style="color:${colorForPct(summary.branches.pct)}">${summary.branches.pct}%</div>
      <div class="label">分支覆盖率 (Branches)</div>
      <div class="frac">${summary.branches.covered} / ${summary.branches.total}</div>
    </div>
    <div class="summary-card">
      <div class="pct" style="color:${colorForPct(summary.functions.pct)}">${summary.functions.pct}%</div>
      <div class="label">函数覆盖率 (Functions)</div>
      <div class="frac">${summary.functions.covered} / ${summary.functions.total}</div>
    </div>
    <div class="summary-card">
      <div class="pct" style="color:${colorForPct(summary.lines.pct)}">${summary.lines.pct}%</div>
      <div class="label">行覆盖率 (Lines)</div>
      <div class="frac">${summary.lines.covered} / ${summary.lines.total}</div>
    </div>
  </div>

  <div class="container">
    <div class="section-title">文件覆盖率详情 (${summary.files.length} 个文件)</div>
    <table>
      <thead>
        <tr>
          <th>文件</th>
          <th class="num">语句%</th><th></th><th class="num">语句</th>
          <th class="num">分支%</th><th></th><th class="num">分支</th>
          <th class="num">函数%</th><th></th><th class="num">函数</th>
          <th class="num">行%</th><th></th><th class="num">行</th>
        </tr>
      </thead>
      <tbody>
        ${filesHtml}
      </tbody>
    </table>
  </div>

  <div class="footer">
    Generated by Playwright E2E Coverage Reporter | q-editor
  </div>
</body>
</html>`;

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, html, "utf-8");
  console.log(`[Coverage] HTML 报告已生成: ${outputPath}`);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export { generateSummary, type CoverageSummary, type FileCoverage, type CoverageStats };
