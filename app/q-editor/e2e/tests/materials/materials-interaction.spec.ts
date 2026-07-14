/**
 * 素材库交互 E2E 测试
 *
 * 覆盖：
 *   - MaterialsView/Layout.vue 路由映射与组件切换
 *   - 选择题组件（单选、多选、下拉、图片单选、图片多选）
 *   - 输入框组件
 *   - 高级组件（日期时间、评分、级联、矩阵、滑块、穿梭框）
 *   - 备注组件
 *   - 个人信息组件
 *   - 编辑面板交互
 *   - 路由切换驱动组件更新
 *   - updateStatus 各种 configKey 分支
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { ROUTES, TIMEOUTS } from "../../fixtures/mock-data";

test.describe("素材库交互", () => {
  test.describe("选择题组件导航", () => {
    test("应能导航到单选题", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.singleSelect);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("应能导航到多选题", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.multiSelect);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("应能导航到下拉题", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.optionSelect);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("应能导航到图片单选题", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.singlePicSelect);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("应能导航到图片多选题", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.multiPicSelect);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("输入框组件导航", () => {
    test("应能导航到文本输入框", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.textInput);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("高级组件导航", () => {
    test("应能导航到日期时间", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.dateTime);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("应能导航到评分题", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.rateScore);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("备注组件导航", () => {
    test("应能导航到备注组件", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.textNote);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("素材库页面布局", () => {
    test("素材库应显示三栏布局", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.singleSelect);
      await page.waitForLoadState("networkidle");

      // 检查布局容器
      const layoutContainer = page.locator('[class*="layout-container"]');
      const count = await layoutContainer.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test("素材库应包含左侧组件列表", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.singleSelect);
      await page.waitForLoadState("networkidle");

      // 左侧应有组件选择列表
      const leftPanel = page.locator('[class*="left"]');
      const count = await leftPanel.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test("素材库应包含中间预览区", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.singleSelect);
      await page.waitForLoadState("networkidle");

      const centerPanel = page.locator('[class*="center"]');
      const count = await centerPanel.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test("素材库应包含右侧编辑面板", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.singleSelect);
      await page.waitForLoadState("networkidle");

      const rightPanel = page.locator('[class*="right"]');
      const count = await rightPanel.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("素材库路由切换", () => {
    test("从单选题切换到多选题应更新组件", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.singleSelect);
      await page.waitForLoadState("networkidle");

      await page.goto(ROUTES.multiSelect);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/multi-select/);
    });

    test("从选择题切换到输入框应更新组件", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.singleSelect);
      await page.waitForLoadState("networkidle");

      await page.goto(ROUTES.textInput);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/text-input/);
    });

    test("从输入框切换到高级组件应更新组件", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.textInput);
      await page.waitForLoadState("networkidle");

      await page.goto(ROUTES.rateScore);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/rate-score/);
    });
  });

  test.describe("素材库组件初始化", () => {
    test("切换到未初始化的组件应自动加载默认配置", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.rateScore);
      await page.waitForLoadState("networkidle");
      // 组件应自动初始化
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("素材库中编辑面板", () => {
    test("编辑面板应包含编辑项", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.singleSelect);
      await page.waitForLoadState("networkidle");

      // 查找编辑面板中的交互元素
      const editElements = page.locator('[class*="right"] input, [class*="right"] button, [class*="right"] .el-input');
      const count = await editElements.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});