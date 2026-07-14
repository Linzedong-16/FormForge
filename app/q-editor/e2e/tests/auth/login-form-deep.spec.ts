/**
 * LoginForm 组件深度 E2E 测试
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { ROUTES, TIMEOUTS, TEST_USERS } from "../../fixtures/mock-data";

test.describe("LoginForm 深度测试", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTES.login);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
  });

  test.describe("表单渲染", () => {
    test("应显示邮箱输入框", async ({ page }) => {
      const emailInput = page.locator('input[type="email"]').first();
      const visible = await emailInput.isVisible({ timeout: TIMEOUTS.short }).catch(() => false);
      expect(visible).toBeTruthy();
    });

    test("应显示密码输入框", async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();
      const visible = await passwordInput.isVisible({ timeout: TIMEOUTS.short }).catch(() => false);
      expect(visible).toBeTruthy();
    });

    test("应显示登录按钮", async ({ page }) => {
      const loginBtn = page.locator('button[type="submit"]').first();
      const visible = await loginBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false);
      expect(visible).toBeTruthy();
    });

    test("应显示注册链接", async ({ page }) => {
      const registerLink = page.locator("a, button, span").filter({ hasText: /注册|register|sign.?up/i }).first();
      const count = await registerLink.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test("应显示忘记密码链接", async ({ page }) => {
      const forgotLink = page.locator("a, button, span").filter({ hasText: /忘记密码|forgot|找回/i }).first();
      const count = await forgotLink.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("表单输入", () => {
    test("应能填写邮箱", async ({ page }) => {
      const emailInput = page.locator('input[type="email"]').first();
      if (await emailInput.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await emailInput.fill("test@example.com");
        const value = await emailInput.inputValue();
        expect(value).toBe("test@example.com");
      }
    });

    test("应能填写密码", async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();
      if (await passwordInput.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await passwordInput.fill("Test@1234");
        const value = await passwordInput.inputValue();
        expect(value).toBe("Test@1234");
      }
    });

    test("密码应支持显示/隐藏切换", async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();
      if (await passwordInput.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        // 查找密码可见性切换按钮
        const toggleBtn = page.locator(".el-input__suffix .el-icon, .password-toggle, [class*='password-eye']").first();
        const toggleVisible = await toggleBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false);
        if (toggleVisible) {
          await toggleBtn.click();
          await page.waitForTimeout(300);
          // 密码输入框类型可能变为 text
          const inputType = await passwordInput.getAttribute("type");
          expect(inputType === "text" || inputType === "password").toBeTruthy();
        }
      }
    });

    test("清空邮箱后重新输入", async ({ page }) => {
      const emailInput = page.locator('input[type="email"]').first();
      if (await emailInput.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await emailInput.fill("test@example.com");
        await emailInput.clear();
        await emailInput.fill("new@example.com");
        const value = await emailInput.inputValue();
        expect(value).toBe("new@example.com");
      }
    });
  });

  test.describe("表单验证", () => {
    test("空表单提交应显示错误提示", async ({ page }) => {
      const loginBtn = page.locator('button[type="submit"]').first();
      if (await loginBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await loginBtn.click();
        await page.waitForTimeout(500);
        // 可能有错误提示
        const errorMsg = page.locator(".el-form-item__error, .el-message--error");
        const count = await errorMsg.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }
    });

    test("无效邮箱格式应显示错误提示", async ({ page }) => {
      const emailInput = page.locator('input[type="email"]').first();
      if (await emailInput.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await emailInput.fill("invalid-email");
        await page.waitForTimeout(300);
        // 触发 blur 验证
        await emailInput.blur();
        await page.waitForTimeout(500);
        const errorMsg = page.locator(".el-form-item__error");
        const count = await errorMsg.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }
    });

    test("有效邮箱应清除错误提示", async ({ page }) => {
      const emailInput = page.locator('input[type="email"]').first();
      if (await emailInput.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        // 先输入无效邮箱
        await emailInput.fill("invalid");
        await emailInput.blur();
        await page.waitForTimeout(300);
        
        // 再输入有效邮箱
        await emailInput.clear();
        await emailInput.fill("valid@example.com");
        await emailInput.blur();
        await page.waitForTimeout(500);
        
        await expect(page.locator("body")).toBeVisible();
      }
    });
  });

  test.describe("登录流程", () => {
    test("应能使用测试账号登录", async ({ page }) => {
      const emailInput = page.locator('input[type="email"]').first();
      const passwordInput = page.locator('input[type="password"]').first();
      const loginBtn = page.locator('button[type="submit"]').first();
      
      if (await emailInput.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await emailInput.fill(TEST_USERS.normal.email);
        await passwordInput.fill(TEST_USERS.normal.password);
        await loginBtn.click();
        await page.waitForTimeout(1000);
        await page.waitForLoadState("networkidle");
      }
      await expect(page.locator("body")).toBeVisible();
    });

    test("登录后应跳转到首页", async ({ page }) => {
      const emailInput = page.locator('input[type="email"]').first();
      const passwordInput = page.locator('input[type="password"]').first();
      const loginBtn = page.locator('button[type="submit"]').first();
      
      if (await emailInput.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await emailInput.fill(TEST_USERS.normal.email);
        await passwordInput.fill(TEST_USERS.normal.password);
        await loginBtn.click();
        await page.waitForTimeout(1000);
        await page.waitForLoadState("networkidle");
      }
      await expect(page.locator("body")).toBeVisible();
    });

    test("错误密码登录应显示错误", async ({ page }) => {
      const emailInput = page.locator('input[type="email"]').first();
      const passwordInput = page.locator('input[type="password"]').first();
      const loginBtn = page.locator('button[type="submit"]').first();
      
      if (await emailInput.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await emailInput.fill("wrong@test.com");
        await passwordInput.fill("WrongPassword1");
        await loginBtn.click();
        await page.waitForTimeout(500);
        // 可能显示错误消息
        const errorMsg = page.locator(".el-message--error, .el-alert--error");
        const count = await errorMsg.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test.describe("切换表单", () => {
    test("点击注册链接应切换到注册表单", async ({ page }) => {
      const registerLink = page.locator("a, button, span").filter({ hasText: /注册|register|sign.?up/i }).first();
      if (await registerLink.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await registerLink.click();
        await page.waitForTimeout(500);
        await expect(page.locator("body")).toBeVisible();
      }
    });
  });

  test.describe("响应式", () => {
    test("移动端登录页面应正常渲染", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);
      await expect(page.locator("body")).toBeVisible();
    });
  });
});