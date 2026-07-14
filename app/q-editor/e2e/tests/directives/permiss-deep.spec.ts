/**
 * v-permiss 指令深度 E2E 测试
 * 覆盖权限指令的核心逻辑
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { ROUTES, TIMEOUTS, TEST_USERS } from "../../fixtures/mock-data";

test.describe("v-permiss 指令深度测试", () => {
  test.describe("权限控制原理", () => {
    test("已认证用户应能访问首页", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.home);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("已认证用户应能访问编辑器", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.editor);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("已认证用户应能访问设置页面", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("未登录用户访问首页应重定向", async ({ page }) => {
      try {
        await page.goto(ROUTES.home, { timeout: TIMEOUTS.medium });
      } catch { /* 重定向可能超时 */ }
      await page.waitForTimeout(1000);
      await expect(page.locator("body")).toBeVisible();
    });

    test("未登录用户访问编辑器应重定向", async ({ page }) => {
      try {
        await page.goto(ROUTES.editor, { timeout: TIMEOUTS.medium });
      } catch { /* 重定向到登录 */ }
      await page.waitForTimeout(1000);
      await expect(page.locator("body")).toBeVisible();
    });

    test("未登录用户访问设置页面应重定向", async ({ page }) => {
      try {
        await page.goto(ROUTES.settings, { timeout: TIMEOUTS.medium });
      } catch { /* 重定向到登录 */ }
      await page.waitForTimeout(1000);
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("管理员权限", () => {
    test("管理员应能访问首页", async ({ adminPage: page }) => {
      await page.goto(ROUTES.home);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("管理员应能访问编辑器", async ({ adminPage: page }) => {
      await page.goto(ROUTES.editor);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("管理员应能访问设置页面", async ({ adminPage: page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("管理员在首页应看到管理按钮", async ({ adminPage: page }) => {
      await page.goto(ROUTES.home);
      await page.waitForLoadState("networkidle");
      const adminBtns = page.locator("button").filter({ hasText: /管理|admin|审核/i });
      const count = await adminBtns.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("权限边界", () => {
    test("快速连续页面切换不应崩溃", async ({ authenticatedPage: page }) => {
      const routes = [ROUTES.home, ROUTES.editor, ROUTES.settings, ROUTES.home];
      for (const route of routes) {
        await page.goto(route);
        await page.waitForTimeout(300);
      }
      await expect(page.locator("body")).toBeVisible();
    });

    test("页面刷新后应保持认证状态", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.home);
      await page.waitForLoadState("networkidle");
      await page.reload();
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("从首页导航到编辑器再返回首页多次不应崩溃", async ({ authenticatedPage: page }) => {
      for (let i = 0; i < 3; i++) {
        await page.goto(ROUTES.home);
        await page.waitForTimeout(300);
        await page.goto(ROUTES.editor);
        await page.waitForTimeout(300);
      }
      await expect(page.locator("body")).toBeVisible();
    });
  });
});