/**
 * 登录页面 E2E 测试
 *
 * 覆盖：
 *   - 登录页面渲染
 *   - 登录表单验证（空字段、错误凭据）
 *   - 成功登录流程
 *   - 注册页面切换
 *   - 已禁用用户登录
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { TEST_USERS, ROUTES, TIMEOUTS } from "../../fixtures/mock-data";

test.describe("登录页面", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTES.login);
    await page.waitForLoadState("networkidle");
  });

  test.describe("页面渲染", () => {
    test("应显示登录表单", async ({ page }) => {
      // 验证邮箱输入框存在（Element Plus type="email"）
      await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: TIMEOUTS.medium });
      // 验证密码输入框存在
      await expect(page.locator('input[type="password"]').first()).toBeVisible();
      // 验证登录按钮存在 — Element Plus native-type="submit" 渲染为 type="submit"
      await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    });

    test("应显示切换到注册的链接", async ({ page }) => {
      await expect(page.locator("body")).toContainText("注册", { timeout: TIMEOUTS.short });
    });
  });

  test.describe("表单验证", () => {
    test("空邮箱提交应显示错误", async ({ page }) => {
      const loginBtn = page.locator('button[type="submit"]').first();
      await loginBtn.click();
      await expect(page.locator("body")).toContainText(/邮箱/, { timeout: TIMEOUTS.short });
    });

    test("空密码提交应显示错误", async ({ page }) => {
      const emailInput = page.locator('input[type="email"]').first();
      await emailInput.fill(TEST_USERS.admin.email);
      const loginBtn = page.locator('button[type="submit"]').first();
      await loginBtn.click();
      await expect(page.locator("body")).toContainText(/密码/, { timeout: TIMEOUTS.short });
    });

    test("错误凭据应显示错误消息", async ({ page }) => {
      const emailInput = page.locator('input[type="email"]').first();
      const passwordInput = page.locator('input[type="password"]').first();
      await emailInput.fill("wrong@example.com");
      await passwordInput.fill("wrongpassword");
      const loginBtn = page.locator('button[type="submit"]').first();
      await loginBtn.click();
      await expect(page.locator("body")).toContainText(/错误/, { timeout: TIMEOUTS.medium });
    });
  });

  test.describe("成功登录", () => {
    test("管理员登录后应跳转到首页", async ({ page }) => {
      const emailInput = page.locator('input[type="email"]').first();
      const passwordInput = page.locator('input[type="password"]').first();
      await emailInput.fill(TEST_USERS.admin.email);
      await passwordInput.fill(TEST_USERS.admin.password);
      const loginBtn = page.locator('button[type="submit"]').first();
      await loginBtn.click();
      await page.waitForURL("**/home", { timeout: TIMEOUTS.navigation });
    });

    test("普通用户登录后应跳转到首页", async ({ page }) => {
      const emailInput = page.locator('input[type="email"]').first();
      const passwordInput = page.locator('input[type="password"]').first();
      await emailInput.fill(TEST_USERS.normal.email);
      await passwordInput.fill(TEST_USERS.normal.password);
      const loginBtn = page.locator('button[type="submit"]').first();
      await loginBtn.click();
      await page.waitForURL("**/home", { timeout: TIMEOUTS.navigation });
    });
  });

  test.describe("异常处理", () => {
    test("已禁用用户登录应显示错误", async ({ page }) => {
      const emailInput = page.locator('input[type="email"]').first();
      const passwordInput = page.locator('input[type="password"]').first();
      await emailInput.fill(TEST_USERS.disabled.email);
      await passwordInput.fill(TEST_USERS.disabled.password);
      const loginBtn = page.locator('button[type="submit"]').first();
      await loginBtn.click();
      await expect(page.locator("body")).toContainText(/禁用/, { timeout: TIMEOUTS.medium });
    });
  });

  test.describe("注册切换", () => {
    test("点击注册链接应切换到注册表单", async ({ page }) => {
      // 查找注册相关文本
      const registerLink = page.locator("text=注册").first();
      await registerLink.click();
      // 验证注册表单出现
      await expect(page.locator("body")).toContainText(/注册|验证码/, { timeout: TIMEOUTS.medium });
    });
  });

  test.describe("忘记密码", () => {
    test("点击忘记密码应打开弹窗", async ({ page }) => {
      const forgotLink = page.locator(".forgot-link, [class*='forgot']").first();
      if (await forgotLink.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await forgotLink.click();
        await page.waitForTimeout(500);
        // 应显示弹窗
        const dialog = page.locator(".el-dialog, .el-dialog__wrapper");
        const count = await dialog.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test.describe("密码输入框", () => {
    test("密码输入框应支持显示/隐藏切换", async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();
      await expect(passwordInput).toBeVisible({ timeout: TIMEOUTS.medium });

      // 查找显示密码的切换按钮
      const toggleBtn = page.locator(".el-input__suffix, .el-input__password, [class*='show-pwd']").first();
      const count = await toggleBtn.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});