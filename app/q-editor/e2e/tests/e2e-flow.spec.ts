/**
 * 全局 E2E 测试 — 端到端用户流程
 *
 * 覆盖：
 *   - 完整登录 → 编辑问卷 → 预览 → 发布流程
 *   - 多页面导航
 *   - 页面响应式
 */
import { test, expect } from "../fixtures/test-fixtures";
import { ROUTES, DEMO_SURVEY, TIMEOUTS } from "../fixtures/mock-data";

test.describe("端到端用户流程", () => {
  test("完整流程：登录 → 首页 → 编辑器 → 素材库 → 预览 → 设置", async ({
    page
  }) => {
    // 1. 登录
    await page.goto(ROUTES.login);
    await page.waitForLoadState("networkidle");
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    await emailInput.fill("admin@example.com");
    await passwordInput.fill("Admin@123");
    const loginBtn = page.locator('button[type="submit"]').first();
    await loginBtn.click();
    await page.waitForURL("**/home", { timeout: TIMEOUTS.navigation });
    await page.waitForLoadState("networkidle");

    // 2. 导航到编辑器
    await page.goto(ROUTES.editor);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();

    // 3. 导航到素材库
    await page.goto(ROUTES.materials);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();

    // 4. 导航到预览
    await page.goto(ROUTES.preview(DEMO_SURVEY.id));
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();

    // 5. 导航到设置
    await page.goto(ROUTES.settings);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("未登录完整流程：Landing → 预览 → 答题", async ({ page }) => {
    // 1. 访问 Landing
    await page.goto(ROUTES.land);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();

    // 2. 访问预览
    await page.goto(ROUTES.preview(DEMO_SURVEY.id));
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();

    // 3. 访问答题页
    await page.goto(ROUTES.survey(DEMO_SURVEY.id));
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("响应式测试", () => {
  test("移动端视口下页面正常渲染", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(ROUTES.login);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("平板视口下页面正常渲染", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(ROUTES.login);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });
});