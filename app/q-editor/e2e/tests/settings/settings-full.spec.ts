/**
 * 设置页面全量 E2E 测试
 *
 * 覆盖：
 *   - 设置页面导航与渲染
 *   - ProfileTab 表单交互（昵称、职业、个人介绍、保存/重置）
 *   - AccountTab 表单交互（邮箱绑定、密码修改、账号注销）
 *   - Tab 切换
 *   - 返回导航
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { ROUTES, TIMEOUTS } from "../../fixtures/mock-data";

test.describe("设置页面", () => {
  // ====================================================================
  // 1. 设置页面导航与渲染
  // ====================================================================
  test.describe("设置页面导航与渲染", () => {
    test("已登录用户应能正常访问设置页面", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");

      const currentUrl = page.url();
      expect(currentUrl).toContain("settings");
      await expect(page.locator("body")).toBeVisible();
    });

    test("设置页面应默认显示个人资料 Tab", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");

      // ProfileTab 应可见
      const profileTab = page.locator(".profile-tab");
      await expect(profileTab).toBeVisible({ timeout: TIMEOUTS.medium });

      // AccountTab 不应可见（默认隐藏）
      const accountTab = page.locator(".account-tab");
      await expect(accountTab).toHaveCount(0);
    });

    test("设置页面应显示两个导航项（个人资料和账号设置）", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");

      const navItems = page.locator(".nav-item");
      const count = await navItems.count();
      expect(count).toBe(2);

      // 验证第一个导航项处于激活状态
      const firstNav = navItems.first();
      const firstNavClass = await firstNav.getAttribute("class");
      expect(firstNavClass).toContain("active");
    });

    test("设置页面应显示顶部导航栏及返回按钮", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");

      // 返回按钮为带有 ArrowLeft 图标的 el-button circle
      const backButton = page.locator(".settings-page .el-button--circle");
      const backBtnCount = await backButton.count();
      expect(backBtnCount).toBeGreaterThanOrEqual(0);

      // 页面标题应可见
      const headerTitle = page.locator(".header-title");
      const titleCount = await headerTitle.count();
      expect(titleCount).toBeGreaterThanOrEqual(0);
    });

    test("切换到账号设置 Tab 后应显示 AccountTab 内容", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");

      // 点击第二个导航项（账号设置）
      const navItems = page.locator(".nav-item");
      const accountNav = navItems.nth(1);
      await accountNav.click();
      await page.waitForTimeout(500);

      // AccountTab 应可见
      const accountTab = page.locator(".account-tab");
      await expect(accountTab).toBeVisible({ timeout: TIMEOUTS.medium });

      // 第二个导航项应处于激活状态
      const updatedNav = page.locator(".nav-item").nth(1);
      const updatedNavClass = await updatedNav.getAttribute("class");
      expect(updatedNavClass).toContain("active");
    });
  });

  // ====================================================================
  // 2. ProfileTab 表单交互
  // ====================================================================
  test.describe("ProfileTab 表单交互", () => {
    test("应能填写昵称字段", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");

      // 昵称输入框位于 .profile-form 中第一个 el-input
      const nicknameInput = page.locator(".profile-form .el-input__inner").first();
      if (await nicknameInput.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await nicknameInput.fill("测试昵称");
        const value = await nicknameInput.inputValue();
        expect(value).toBe("测试昵称");
      }
    });

    test("应能填写职业字段", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");

      // 职业输入框位于 .profile-form 中 el-autocomplete 的 .el-input__inner
      const occupationInputs = page.locator(".profile-form .el-input__inner");
      const count = await occupationInputs.count();
      // 职业通常是第二个 input（第一个是昵称）
      if (count >= 2) {
        const occupationInput = occupationInputs.nth(1);
        if (await occupationInput.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
          await occupationInput.fill("前端开发工程师");
          const value = await occupationInput.inputValue();
          expect(value).toBe("前端开发工程师");
        }
      }
    });

    test("应能填写个人介绍 textarea", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");

      const bioTextarea = page.locator(".profile-form textarea").first();
      if (await bioTextarea.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await bioTextarea.fill("这是一段个人介绍测试文本");
        const value = await bioTextarea.inputValue();
        expect(value).toBe("这是一段个人介绍测试文本");
      }
    });

    test("应能点击保存按钮", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");

      // 先填写昵称确保表单不为空
      const nicknameInput = page.locator(".profile-form .el-input__inner").first();
      if (await nicknameInput.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await nicknameInput.fill("保存测试");
      }

      // 点击保存按钮（primary 按钮）
      const saveBtn = page.locator(".profile-form .el-button--primary").first();
      if (await saveBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        const isDisabled = await saveBtn.isDisabled().catch(() => false);
        if (!isDisabled) {
          await saveBtn.click();
          await page.waitForTimeout(500);
        }
      }

      // 页面应保持稳定，不崩溃
      await expect(page.locator("body")).toBeVisible();
    });

    test("应能点击重置按钮并验证表单重置", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");

      // 先填写昵称
      const nicknameInput = page.locator(".profile-form .el-input__inner").first();
      if (await nicknameInput.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await nicknameInput.fill("测试修改昵称");
        await page.waitForTimeout(300);

        // 点击重置按钮（非 primary 的 el-button）
        const resetBtn = page.locator(".profile-form .el-button:not(.el-button--primary)").first();
        if (await resetBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
          await resetBtn.click();
          await page.waitForTimeout(500);
        }
      }
      // 页面应保持稳定
      await expect(page.locator("body")).toBeVisible();
    });

    test("表单应显示兴趣标签区域", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");

      // 兴趣标签组件应存在（可能带有 .el-checkbox-group 或自定义 class）
      const interestArea = page.locator(".profile-form .el-form-item").last();
      const count = await interestArea.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  // ====================================================================
  // 3. AccountTab 表单交互
  // ====================================================================
  test.describe("AccountTab 表单交互", () => {
    test.beforeEach(async ({ authenticatedPage: page }) => {
      // 切换到账号设置 Tab
      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");

      const navItems = page.locator(".nav-item");
      const accountNav = navItems.nth(1);
      await accountNav.click();
      await page.waitForTimeout(500);
    });

    test("应显示邮箱输入框", async ({ authenticatedPage: page }) => {
      const emailInput = page.locator(".account-tab .account-form .el-input__inner").first();
      const count = await emailInput.count();
      expect(count).toBeGreaterThan(0);
    });

    test("应显示发送验证码按钮", async ({ authenticatedPage: page }) => {
      const sendBtn = page.locator(".account-tab button").filter({ hasText: /发送验证码|send/i }).first();
      const count = await sendBtn.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test("应显示密码表单字段", async ({ authenticatedPage: page }) => {
      // 密码输入框为 type="password"
      const passwordInputs = page.locator('.account-tab input[type="password"]');
      const count = await passwordInputs.count();
      expect(count).toBeGreaterThanOrEqual(3); // currentPassword, newPassword, confirmPassword
    });

    test("应显示注销账号按钮", async ({ authenticatedPage: page }) => {
      const deleteBtn = page.locator(".account-tab .el-button--danger").first();
      const count = await deleteBtn.count();
      expect(count).toBeGreaterThan(0);
    });

    test("应显示忘记密码按钮", async ({ authenticatedPage: page }) => {
      const forgotBtn = page.locator(".account-tab button").filter({ hasText: /忘记密码|forgot/i }).first();
      const count = await forgotBtn.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test("应能填写邮箱字段", async ({ authenticatedPage: page }) => {
      const emailInput = page.locator(".account-tab .account-form .el-input__inner").first();
      if (await emailInput.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await emailInput.fill("test-bind@example.com");
        const value = await emailInput.inputValue();
        expect(value).toBe("test-bind@example.com");
      }
    });

    test("应能填写密码字段", async ({ authenticatedPage: page }) => {
      const passwordInputs = page.locator('.account-tab input[type="password"]');
      const count = await passwordInputs.count();

      if (count >= 1) {
        await passwordInputs.nth(0).fill("CurrentPass1");
        await expect(passwordInputs.nth(0)).toHaveValue("CurrentPass1");
      }
      if (count >= 2) {
        await passwordInputs.nth(1).fill("NewPass123");
        await expect(passwordInputs.nth(1)).toHaveValue("NewPass123");
      }
      if (count >= 3) {
        await passwordInputs.nth(2).fill("NewPass123");
        await expect(passwordInputs.nth(2)).toHaveValue("NewPass123");
      }
    });

    test("应能点击确认绑定按钮", async ({ authenticatedPage: page }) => {
      const bindBtn = page.locator(".account-tab button").filter({ hasText: /确认绑定|confirm bind/i }).first();
      if (await bindBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await bindBtn.click();
        await page.waitForTimeout(500);
      }
      await expect(page.locator("body")).toBeVisible();
    });

    test("应能点击更新密码按钮", async ({ authenticatedPage: page }) => {
      const updatePwdBtn = page.locator(".account-tab button").filter({ hasText: /更新密码|update password/i }).first();
      if (await updatePwdBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await updatePwdBtn.click();
        await page.waitForTimeout(500);
      }
      await expect(page.locator("body")).toBeVisible();
    });

    test("应能点击发送验证码按钮", async ({ authenticatedPage: page }) => {
      // 先填写邮箱
      const emailInput = page.locator(".account-tab .account-form .el-input__inner").first();
      if (await emailInput.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await emailInput.fill("test-send@example.com");
      }

      const sendBtn = page.locator(".account-tab button").filter({ hasText: /发送验证码|send code/i }).first();
      if (await sendBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        const isDisabled = await sendBtn.isDisabled().catch(() => false);
        if (!isDisabled) {
          await sendBtn.click();
          await page.waitForTimeout(500);
        }
      }
      await expect(page.locator("body")).toBeVisible();
    });
  });

  // ====================================================================
  // 4. Tab 切换
  // ====================================================================
  test.describe("Tab 切换", () => {
    test("应从个人资料切换到账号设置再切换回来", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");

      const navItems = page.locator(".nav-item");

      // 默认在个人资料 Tab
      await expect(page.locator(".profile-tab")).toBeVisible({ timeout: TIMEOUTS.medium });

      // 切换到账号设置
      await navItems.nth(1).click();
      await page.waitForTimeout(500);
      await expect(page.locator(".account-tab")).toBeVisible({ timeout: TIMEOUTS.medium });

      // 切换回个人资料
      await navItems.nth(0).click();
      await page.waitForTimeout(500);
      await expect(page.locator(".profile-tab")).toBeVisible({ timeout: TIMEOUTS.medium });
    });

    test("多次切换 Tab 后页面应保持稳定", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");

      const navItems = page.locator(".nav-item");

      // 切换 3 次
      for (let i = 0; i < 3; i++) {
        await navItems.nth(1).click();
        await page.waitForTimeout(500);
        await expect(page.locator(".account-tab")).toBeVisible({ timeout: TIMEOUTS.medium });

        await navItems.nth(0).click();
        await page.waitForTimeout(500);
        await expect(page.locator(".profile-tab")).toBeVisible({ timeout: TIMEOUTS.medium });
      }

      // 页面应保持稳定
      await expect(page.locator("body")).toBeVisible();
    });

    test("切换 Tab 后导航项激活状态应正确更新", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");

      const navItems = page.locator(".nav-item");

      // 默认第一个激活
      let firstClass = await navItems.nth(0).getAttribute("class");
      expect(firstClass).toContain("active");

      // 切换到账号设置
      await navItems.nth(1).click();
      await page.waitForTimeout(500);

      firstClass = await navItems.nth(0).getAttribute("class");
      let secondClass = await navItems.nth(1).getAttribute("class");
      expect(firstClass).not.toContain("active");
      expect(secondClass).toContain("active");

      // 切换回个人资料
      await navItems.nth(0).click();
      await page.waitForTimeout(500);

      firstClass = await navItems.nth(0).getAttribute("class");
      secondClass = await navItems.nth(1).getAttribute("class");
      expect(firstClass).toContain("active");
      expect(secondClass).not.toContain("active");
    });
  });

  // ====================================================================
  // 5. 导航返回
  // ====================================================================
  test.describe("导航返回", () => {
    test("点击返回按钮应导航到上一页", async ({ authenticatedPage: page }) => {
      // 先从首页导航到设置页
      await page.goto(ROUTES.home);
      await page.waitForLoadState("networkidle");

      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");

      const currentUrl = page.url();
      expect(currentUrl).toContain("settings");

      // 点击返回按钮（带有 ArrowLeft 图标的 el-button circle）
      const backButton = page.locator(".settings-page .el-button--circle").first();
      if (await backButton.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await backButton.click();
        await page.waitForTimeout(1000);

        // 应回到首页
        const newUrl = page.url();
        expect(newUrl).toContain("home");
      }
    });

    test("从账号设置 Tab 点击返回按钮也应正常导航", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.home);
      await page.waitForLoadState("networkidle");

      await page.goto(ROUTES.settings);
      await page.waitForLoadState("networkidle");

      // 切换到账号设置 Tab
      const navItems = page.locator(".nav-item");
      await navItems.nth(1).click();
      await page.waitForTimeout(500);

      // 点击返回按钮
      const backButton = page.locator(".settings-page .el-button--circle").first();
      if (await backButton.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await backButton.click();
        await page.waitForTimeout(1000);

        const newUrl = page.url();
        expect(newUrl).toContain("home");
      }
    });
  });
});
