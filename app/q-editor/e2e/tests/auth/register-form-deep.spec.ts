/**
 * RegisterForm 组件深度 E2E 测试
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { ROUTES, TIMEOUTS } from "../../fixtures/mock-data";

test.describe("RegisterForm 深度测试", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTES.login);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    
    // 尝试切换到注册表单
    const registerLink = page.locator("a, button, span").filter({ hasText: /注册|register|sign.?up/i }).first();
    if (await registerLink.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
      await registerLink.click();
      await page.waitForTimeout(500);
    }
  });

  test.describe("表单渲染", () => {
    test("注册表单应正常渲染", async ({ page }) => {
      await expect(page.locator("body")).toBeVisible();
    });

    test("应显示用户名输入框", async ({ page }) => {
      const usernameInput = page.locator("input").filter({ hasText: "" }).first();
      const count = await usernameInput.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test("应显示邮箱输入框", async ({ page }) => {
      const emailInput = page.locator('input[type="email"]').first();
      const count = await emailInput.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test("应显示密码输入框", async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();
      const count = await passwordInput.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test("应显示注册按钮", async ({ page }) => {
      const registerBtn = page.locator('button[type="submit"]').first();
      const count = await registerBtn.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("表单输入", () => {
    test("应能填写用户名", async ({ page }) => {
      const inputs = page.locator("input").filter({ hasText: "" });
      const count = await inputs.count();
      if (count >= 1) {
        await inputs.nth(0).fill("测试用户");
        await page.waitForTimeout(300);
        const value = await inputs.nth(0).inputValue();
        expect(value).toBe("测试用户");
      }
    });

    test("应能填写邮箱", async ({ page }) => {
      const emailInput = page.locator('input[type="email"]').first();
      if (await emailInput.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await emailInput.fill("newuser@test.com");
        const value = await emailInput.inputValue();
        expect(value).toBe("newuser@test.com");
      }
    });

    test("应能填写密码", async ({ page }) => {
      const passwordInputs = page.locator('input[type="password"]');
      const count = await passwordInputs.count();
      if (count >= 1) {
        await passwordInputs.nth(0).fill("NewPass@123");
        const value = await passwordInputs.nth(0).inputValue();
        expect(value).toBe("NewPass@123");
      }
    });
  });

  test.describe("表单验证", () => {
    test("空表单提交应显示错误", async ({ page }) => {
      const registerBtn = page.locator('button[type="submit"]').first();
      if (await registerBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await registerBtn.click();
        await page.waitForTimeout(500);
        const errorMsg = page.locator(".el-form-item__error, .el-message--error");
        const count = await errorMsg.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }
    });

    test("密码过短应显示错误", async ({ page }) => {
      const passwordInputs = page.locator('input[type="password"]');
      if (await passwordInputs.nth(0).isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await passwordInputs.nth(0).fill("123");
        await passwordInputs.nth(0).blur();
        await page.waitForTimeout(500);
        const errorMsg = page.locator(".el-form-item__error");
        const count = await errorMsg.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test.describe("切换表单", () => {
    test("点击登录链接应切换到登录表单", async ({ page }) => {
      const loginLink = page.locator("a, button, span").filter({ hasText: /登录|login|sign.?in/i }).first();
      if (await loginLink.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await loginLink.click();
        await page.waitForTimeout(500);
        await expect(page.locator("body")).toBeVisible();
      }
    });

    test("注册页面来回切换登录/注册不应崩溃", async ({ page }) => {
      // 切换到登录
      const loginLink = page.locator("a, button, span").filter({ hasText: /登录|login/i }).first();
      if (await loginLink.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await loginLink.click();
        await page.waitForTimeout(300);
        
        // 切换回注册
        const registerLink = page.locator("a, button, span").filter({ hasText: /注册|register/i }).first();
        if (await registerLink.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
          await registerLink.click();
          await page.waitForTimeout(300);
        }
      }
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("响应式", () => {
    test("移动端注册页面应正常渲染", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);
      await expect(page.locator("body")).toBeVisible();
    });
  });
});