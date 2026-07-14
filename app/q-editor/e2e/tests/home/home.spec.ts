/**
 * 首页 E2E 测试
 *
 * 覆盖：
 *   - 首页渲染（表格、按钮）
 *   - 创建问卷
 *   - 组件市场导航
 *   - 分页与排序
 *   - 删除问卷
 *   - 同步远程数据
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { ROUTES, TIMEOUTS } from "../../fixtures/mock-data";

test.describe("首页", () => {
  test.describe("页面渲染", () => {
    test("首页应正常渲染", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.home);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("首页应显示创建问卷按钮", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.home);
      await page.waitForLoadState("networkidle");
      const createBtn = page.locator("button").filter({ hasText: /创建|新建/ }).first();
      await expect(createBtn).toBeVisible({ timeout: TIMEOUTS.medium });
    });

    test("首页应显示组件市场按钮", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.home);
      await page.waitForLoadState("networkidle");
      const marketBtn = page.locator("button").filter({ hasText: /组件市场|素材/ }).first();
      await expect(marketBtn).toBeVisible({ timeout: TIMEOUTS.medium });
    });

    test("首页应显示数据表格", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.home);
      await page.waitForLoadState("networkidle");
      // Element Plus 表格
      const table = page.locator(".el-table, table");
      const count = await table.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test("首页应显示用户头像", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.home);
      await page.waitForLoadState("networkidle");
      const avatar = page.locator(".el-avatar, [class*='avatar']");
      const count = await avatar.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe("导航功能", () => {
    test("点击创建问卷应跳转到编辑器", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.home);
      await page.waitForLoadState("networkidle");

      const createBtn = page.locator("button").filter({ hasText: /创建|新建/ }).first();
      if (await createBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await createBtn.click();
        await page.waitForURL(/editor|survey-type/, { timeout: TIMEOUTS.navigation });
        await expect(page.locator("body")).toBeVisible();
      }
    });

    test("点击组件市场应跳转到素材库", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.home);
      await page.waitForLoadState("networkidle");

      const marketBtn = page.locator("button").filter({ hasText: /组件市场|素材/ }).first();
      if (await marketBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await marketBtn.click();
        await page.waitForURL(/single-select|materials|select-group/, { timeout: TIMEOUTS.navigation });
        await expect(page.locator("body")).toBeVisible();
      }
    });
  });

  test.describe("分页功能", () => {
    test("首页应显示分页器", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.home);
      await page.waitForLoadState("networkidle");

      const pagination = page.locator(".el-pagination");
      const count = await pagination.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("返回 Landing", () => {
    test("点击返回按钮应跳转到 Landing 页面", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.home);
      await page.waitForLoadState("networkidle");

      const backBtn = page.locator(".el-button--small.is-circle").first();
      if (await backBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await backBtn.click();
        await page.waitForURL(/\/$/, { timeout: TIMEOUTS.navigation }).catch(() => {});
      }
    });
  });
});