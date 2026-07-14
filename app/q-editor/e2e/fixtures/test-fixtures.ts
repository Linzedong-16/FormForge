import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { TEST_USERS, ROUTES, DEMO_SURVEY, TIMEOUTS } from "./mock-data";
import { collectCoverage } from "./coverage";

/**
 * 自定义 Playwright Fixtures
 *
 * 提供：
 *   - authenticatedPage: 已登录的页面
 *   - adminPage: 管理员已登录的页面
 *   - 自动覆盖率收集（配合 vite-plugin-istanbul）
 *   - loginAs: 登录辅助函数
 *   - Editor helpers: 编辑器操作辅助
 */

// ── 登录辅助 ──────────────────────────────────────────────────

async function login(page: Page, email: string, password: string) {
  await page.goto(ROUTES.login);
  await page.waitForLoadState("networkidle");

  // 填写邮箱 — Element Plus el-input type="email" 渲染为 input[type="email"]
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: "visible", timeout: TIMEOUTS.medium });
  await emailInput.fill(email);

  // 填写密码
  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(password);

  // 点击登录按钮 — Element Plus el-button native-type="submit" 渲染为 button[type="submit"]
  const loginButton = page.locator('button[type="submit"]').first();
  await loginButton.click();

  // 等待跳转到首页
  await page.waitForURL("**/home", { timeout: TIMEOUTS.navigation });
  await page.waitForLoadState("networkidle");
}

async function loginAsAdmin(page: Page) {
  await login(page, TEST_USERS.admin.email, TEST_USERS.admin.password);
}

async function loginAsNormalUser(page: Page) {
  await login(page, TEST_USERS.normal.email, TEST_USERS.normal.password);
}

// ── 编辑器辅助 ────────────────────────────────────────────────

async function navigateToEditor(page: Page, createNew = true) {
  if (createNew) {
    await page.goto("/editor");
  } else {
    await page.goto(`/editor/${DEMO_SURVEY.id}`);
  }
  await page.waitForLoadState("networkidle");
}

async function navigateToPreview(page: Page, surveyId: string = DEMO_SURVEY.id) {
  await page.goto(ROUTES.preview(surveyId));
  await page.waitForLoadState("networkidle");
}

async function navigateToSurvey(page: Page, surveyId: string = DEMO_SURVEY.id) {
  await page.goto(ROUTES.survey(surveyId));
  await page.waitForLoadState("networkidle");
}

// ── 导出 Fixtures ─────────────────────────────────────────────

export const test = base.extend<{
  authenticatedPage: Page;
  adminPage: Page;
}>({
  // 覆盖默认 page fixture，在每次测试后自动收集覆盖率
  page: async ({ page }, use, testInfo) => {
    await use(page);
    // 测试结束后收集覆盖率
    await collectCoverage(page, testInfo.title);
  },

  authenticatedPage: async ({ page }, use) => {
    await loginAsNormalUser(page);
    await use(page);
  },

  adminPage: async ({ page }, use) => {
    await loginAsAdmin(page);
    await use(page);
  }
});

export { expect, login, loginAsAdmin, loginAsNormalUser, navigateToEditor, navigateToPreview, navigateToSurvey };
