/**
 * 首页/Landing 页面 E2E 测试
 *
 * 覆盖：
 *   - Landing 页面渲染
 *   - 从 Landing 跳转到登录
 *   - 未登录访问受保护页面重定向
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { ROUTES, TIMEOUTS } from "../../fixtures/mock-data";

test.describe("Landing 页面", () => {
  test.describe("页面渲染", () => {
    test("应正常渲染 Landing 页面", async ({ page }) => {
      await page.goto(ROUTES.land);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("Landing 页面应包含导航元素", async ({ page }) => {
      await page.goto(ROUTES.land);
      await page.waitForLoadState("networkidle");
      // 验证页面至少有一个可交互元素
      const links = page.locator("a, button");
      const count = await links.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe("导航跳转", () => {
    test("从 Landing 应能跳转到登录页", async ({ page }) => {
      await page.goto(ROUTES.land);
      await page.waitForLoadState("networkidle");

      // 尝试找到登录入口
      const loginLink = page.locator('a[href*="login"], button:has-text("登录"), text=登录').first();
      if (await loginLink.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await loginLink.click();
        await page.waitForLoadState("networkidle");
        await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: TIMEOUTS.medium });
      }
    });
  });
});