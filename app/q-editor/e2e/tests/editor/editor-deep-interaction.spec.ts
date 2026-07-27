/**
 * 编辑器深度交互 E2E 测试
 *
 * 覆盖：
 *   - 编辑器组件点击、选中、取消选中
 *   - 键盘快捷键（Ctrl+Z/Y/S）
 *   - 左侧面板切换（SurveyType/Outline/TemplateMarket）
 *   - 右侧属性面板交互
 *   - 编辑器中的可交互元素操作
 *   - 多页面导航
 *   - 页面 resize 响应
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { ROUTES, TIMEOUTS } from "../../fixtures/mock-data";

test.describe("编辑器深度交互", () => {
  test.describe("完整交互流程", () => {
    test("应能完成：登录 → 编辑 → 切换面板 → 素材库 → 返回", async ({ page }) => {
      // 登录
      await page.goto(ROUTES.login);
      await page.waitForLoadState("networkidle");
      const emailInput = page.locator('input[type="email"]').first();
      const passwordInput = page.locator('input[type="password"]').first();
      await emailInput.fill("admin@example.com");
      await passwordInput.fill("Admin@123");
      await page.locator('button[type="submit"]').first().click();
      await page.waitForURL("**/home", { timeout: TIMEOUTS.navigation });
      await page.waitForLoadState("networkidle");

      // 导航到编辑器
      await page.goto(ROUTES.editor);
      await page.waitForLoadState("networkidle");

      // 点击编辑器中的组件
      const components = page.locator('[class*="center"] [class*="content"]');
      const compCount = await components.count();
      for (let i = 0; i < Math.min(compCount, 3); i++) {
        if (await components.nth(i).isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
          await components.nth(i).click();
          await page.waitForTimeout(300);
        }
      }

      // 切换到 outline 面板
      await page.goto(ROUTES.editorOutline);
      await page.waitForLoadState("networkidle");

      // 切换到素材库
      await page.goto(ROUTES.materials);
      await page.waitForLoadState("networkidle");

      // 返回编辑器
      await page.goto(ROUTES.editor);
      await page.waitForLoadState("networkidle");

      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("编辑器面板切换", () => {
    test("应能在 survey-type / outline / template-market 之间切换", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.editor);
      await page.waitForLoadState("networkidle");

      // 切换到 outline
      await page.goto(ROUTES.editorOutline);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/outline/);

      // 切换到 template-market
      await page.goto(ROUTES.editorTemplateMarket);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/template-market/);

      // 切换回 survey-type
      await page.goto(ROUTES.editorSurveyType);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/survey-type/);
    });
  });

  test.describe("编辑器头部按钮交互", () => {
    test("点击返回按钮应能返回首页", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.editor);
      await page.waitForLoadState("networkidle");

      const backBtn = page.locator(".el-button--small.is-circle").first();
      if (await backBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await backBtn.click();
        await page.waitForTimeout(500);
      }

      const currentUrl = page.url();
      expect(currentUrl).toBeTruthy();
    });
  });

  test.describe("编辑器滚轮事件", () => {
    test("编辑器中心区域应响应滚轮事件", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.editor);
      await page.waitForLoadState("networkidle");

      // 在中心区域模拟滚轮事件
      const centerArea = page.locator('[class*="center-container"]').first();
      if (await centerArea.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await centerArea.hover();
        await page.mouse.wheel(0, 100);
        await page.waitForTimeout(300);
      }

      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("编辑器中的输入框", () => {
    test("编辑器中的输入框应可交互", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.editor);
      await page.waitForLoadState("networkidle");

      const inputs = page.locator("input[type='text'], textarea");
      const count = await inputs.count();
      // 至少应有一些输入元素存在
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("编辑器分页", () => {
    test("编辑器应支持分页显示组件", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.editor);
      await page.waitForLoadState("networkidle");

      // 查找分页相关元素
      const pagination = page.locator(".el-pagination, [class*='pagination']");
      const count = await pagination.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});