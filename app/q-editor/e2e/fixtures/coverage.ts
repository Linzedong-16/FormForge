/**
 * 覆盖率收集 Fixture
 *
 * 配合 vite-plugin-istanbul 使用，从页面的 window.__coverage__ 收集覆盖率数据
 * 测试结束后合并生成覆盖率报告
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COVERAGE_DIR = path.resolve(__dirname, "..", ".coverage");

/** 确保覆盖率目录存在 */
function ensureCoverageDir() {
  if (!fs.existsSync(COVERAGE_DIR)) {
    fs.mkdirSync(COVERAGE_DIR, { recursive: true });
  }
}

/**
 * 从页面中收集 __coverage__ 数据并保存到文件
 */
export async function collectCoverage(page: Page, testName: string) {
  try {
    const coverage = await page.evaluate(() => {
      return (window as unknown as Record<string, unknown>).__coverage__;
    });

    if (coverage) {
      ensureCoverageDir();
      const safeName = testName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_");
      const filePath = path.join(COVERAGE_DIR, `coverage-${safeName}-${Date.now()}.json`);
      fs.writeFileSync(filePath, JSON.stringify(coverage));
      console.log(`[Coverage] 已收集: ${safeName}`);
    }
  } catch (err) {
    // 覆盖率收集失败不应阻塞测试
    console.warn(`[Coverage] 收集失败: ${testName}`, err instanceof Error ? err.message : err);
  }
}

/**
 * 合并所有覆盖率数据并生成报告
 * 需要在 globalTeardown 中调用
 */
export async function mergeCoverageReports() {
  ensureCoverageDir();

  const files = fs.readdirSync(COVERAGE_DIR).filter(f => f.endsWith(".json"));
  if (files.length === 0) {
    console.log("[Coverage] 没有覆盖率数据需要合并");
    return;
  }

  console.log(`[Coverage] 合并 ${files.length} 个覆盖率文件...`);

  // 合并所有覆盖率数据
  const merged: Record<string, unknown> = {};
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(COVERAGE_DIR, file), "utf-8"));
      for (const [key, value] of Object.entries(data)) {
        if (merged[key]) {
          // 合并同名文件的覆盖率（累加计数器）
          const existing = merged[key] as Record<string, unknown>;
          const incoming = value as Record<string, unknown>;
          if (existing.s && incoming.s) {
            // 合并语句计数器
            const existingS = existing.s as Record<string, number>;
            const incomingS = incoming.s as Record<string, number>;
            for (const [k, v] of Object.entries(incomingS)) {
              existingS[k] = (existingS[k] || 0) + v;
            }
          }
          if (existing.b && incoming.b) {
            // 合并分支计数器
            const existingB = existing.b as Record<string, number[]>;
            const incomingB = incoming.b as Record<string, number[]>;
            for (const [k, v] of Object.entries(incomingB)) {
              if (existingB[k]) {
                existingB[k] = existingB[k]!.map((count, i) => count + (v[i] || 0));
              } else {
                existingB[k] = v;
              }
            }
          }
          if (existing.f && incoming.f) {
            // 合并函数计数器
            const existingF = existing.f as Record<string, number>;
            const incomingF = incoming.f as Record<string, number>;
            for (const [k, v] of Object.entries(incomingF)) {
              existingF[k] = (existingF[k] || 0) + v;
            }
          }
        } else {
          merged[key] = value;
        }
      }
    } catch (err) {
      console.warn(`[Coverage] 合并文件失败: ${file}`, err instanceof Error ? err.message : err);
    }
  }

  // 保存合并后的覆盖率数据
  const mergedPath = path.join(COVERAGE_DIR, "coverage-merged.json");
  fs.writeFileSync(mergedPath, JSON.stringify(merged));
  console.log(`[Coverage] 合并完成，保存到: ${mergedPath}`);

  return mergedPath;
}
