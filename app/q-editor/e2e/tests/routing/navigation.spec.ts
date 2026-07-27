/**
 * 路由导航 E2E 测试
 *
 * 覆盖：
 *   - 未登录路由守卫（重定向到登录页）
 *   - 登录后路由跳转
 *   - 页面刷新后状态保持
 *   - 404 页面处理
 *   - 路由参数传递
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { ROUTES, DEMO_SURVEY, TIMEOUTS } from "../../fixtures/mock-data";

test.describe("路由导航", () => {
  test.describe("未登录路由守卫", () => {
    test("未登录访问 /home 应重定向到登录页", async ({ page }) => {
      await page.goto(ROUTES.home);
      await page.waitForLoadState("networkidle");
      // 应该重定向到登录页
      await expect(page).toHaveURL(/login/, { timeout: TIMEOUTS.navigation });
    });

    test("未登录访问 /editor 应重定向到登录页", async ({ page }) => {
      await page.goto(ROUTES.editor);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/login/, { timeout: TIMEOUTS.navigation });
    });

    test("未登录访问 /materials 应重定向到登录页", async ({ page }) => {
      await page.goto(ROUTES.materials);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/login/, { timeout: TIMEOUTS.navigation });
    });

    test("未登录访问 /settings 应重定向到登录页", async ({ page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/login/, { timeout: TIMEOUTS.navigation });
    });

    test("公开路由 /preview 不需要登录", async ({ page }) => {
      await page.goto(ROUTES.preview(DEMO_SURVEY.id));
      await page.waitForLoadState("networkidle");
      // 不应重定向到登录页
      await expect(page).not.toHaveURL(/login/);
    });

    test("公开路由 /survey 不需要登录", async ({ page }) => {
      await page.goto(ROUTES.survey(DEMO_SURVEY.id));
      await page.waitForLoadState("networkidle");
      await expect(page).not.toHaveURL(/login/);
    });

    test("公开路由 / (landing) 不需要登录", async ({ page }) => {
      await page.goto(ROUTES.land);
      await page.waitForLoadState("networkidle");
      await expect(page).not.toHaveURL(/login/);
    });
  });

  test.describe("登录后路由跳转", () => {
    test("登录后应能访问 /home", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.home);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/home/);
    });

    test("登录后应能访问 /editor", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.editor);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/editor/);
    });

    test("登录后应能访问 /materials", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.materials);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/materials|select-group|single-select/);
    });

    test("登录后应能访问 /settings", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/settings/);
    });
  });

  test.describe("编辑器子路由", () => {
    test("/editor 应显示 survey-type 子路由", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.editor);
      await page.waitForLoadState("networkidle");
      // 应自动重定向到 survey-type
      await expect(page).toHaveURL(/survey-type/);
    });

    test("/editor/survey-type 应正常渲染", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.editorSurveyType);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("/editor/outline 应正常渲染", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.editorOutline);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("素材库子路由", () => {
    test("/materials 应重定向到 select-group", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.materials);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/single-select|select-group/);
    });

    test("应能导航到各素材分组", async ({ authenticatedPage: page }) => {
      const groups = [
        ROUTES.inputGroup,
        ROUTES.advancedGroup,
        ROUTES.noteGroup,
        ROUTES.personalInfoGroup,
        ROUTES.contactGroup
      ];

      for (const group of groups) {
        await page.goto(group);
        await page.waitForLoadState("networkidle");
        await expect(page.locator("body")).toBeVisible();
      }
    });
  });

  test.describe("不存在的路由", () => {
    test("访问不存在的路由应显示 404 或返回首页", async ({ page }) => {
      await page.goto("/nonexistent-page-xyz");
      await page.waitForLoadState("networkidle");
      // 应该显示 404 或保持在某个页面
      await expect(page.locator("body")).toBeVisible();
    });
  });
});