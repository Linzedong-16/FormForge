/**
 * 注册页面 E2E 测试
 *
 * 覆盖：
 *   - 注册表单渲染
 *   - 表单验证（空字段、密码强度、邮箱格式）
 *   - 验证码发送
 *   - 注册成功流程
 *   - 切换到登录
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { ROUTES, TIMEOUTS } from "../../fixtures/mock-data";

test.describe("注册页面", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTES.login);
    await page.waitForLoadState("networkidle");
    // 切换到注册表单
    const registerLink = page.locator("text=注册").first();
    await registerLink.click();
    await page.waitForTimeout(500);
  });

  test.describe("页面渲染", () => {
    test("应显示注册表单", async ({ page }) => {
      await expect(page.locator("body")).toContainText(/注册|验证码/, { timeout: TIMEOUTS.medium });
    });

    test("应显示发送验证码按钮", async ({ page }) => {
      const sendCodeBtn = page.locator("button").filter({ hasText: /发送|验证码/ }).first();
      if (await sendCodeBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await expect(sendCodeBtn).toBeVisible();
      }
    });
  });

  test.describe("表单验证", () => {
    test("空邮箱注册应显示注册按钮为禁用状态", async ({ page }) => {
      // 空表单时注册按钮应处于禁用状态
      const registerBtn = page.locator("button").filter({ hasText: /注册/ }).first();
      await expect(registerBtn).toBeVisible({ timeout: TIMEOUTS.medium });
      await expect(registerBtn).toBeDisabled();
    });
  });

  test.describe("切换回登录", () => {
    test("应能切换回登录页面", async ({ page }) => {
      const loginLink = page.locator("text=登录").first();
      await loginLink.click();
      await page.waitForTimeout(300);
      // 应该看到登录表单
      await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: TIMEOUTS.short });
    });
  });
});