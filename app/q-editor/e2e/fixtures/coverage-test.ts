/**
 * 带覆盖率收集的 Test Fixture
 *
 * 扩展 Playwright test，在每个测试结束后自动收集 window.__coverage__ 数据
 * 配合 vite-plugin-istanbul 使用
 *
 * 使用方式：
 *   import { test, expect } from "../../fixtures/coverage-test";
 *   // 或
 *   import { test, expect } from "../../fixtures/coverage-test";
 *   // 使用 authenticatedPage fixture
 */
import { test as base, expect, type Page } from "@playwright/test";
import { collectCoverage } from "./coverage";
import { loginAsNormalUser, loginAsAdmin } from "./test-fixtures";

// 导出 test-fixtures 中的辅助函数
export { loginAsNormalUser, loginAsAdmin } from "./test-fixtures";
export * from "./test-fixtures";

/**
 * 覆盖率收集 Fixture
 */
const coverageTest = base.extend<{
  authenticatedPage: Page;
  adminPage: Page;
}>({
  authenticatedPage: async ({ page }, use, testInfo) => {
    await loginAsNormalUser(page);
    await use(page);
    // 测试结束后收集覆盖率
    await collectCoverage(page, testInfo.title);
  },

  adminPage: async ({ page }, use, testInfo) => {
    await loginAsAdmin(page);
    await use(page);
    // 测试结束后收集覆盖率
    await collectCoverage(page, testInfo.title);
  },

  // 覆盖默认 page fixture，在每次测试后收集覆盖率
  page: async ({ page }, use, testInfo) => {
    await use(page);
    // 测试结束后收集覆盖率
    await collectCoverage(page, testInfo.title);
  }
});

export { coverageTest as test, expect };
