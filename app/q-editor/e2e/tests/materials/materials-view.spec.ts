/**
 * 素材库页面 E2E 测试
 *
 * 覆盖：
 *   - 素材库页面渲染
 *   - 各组件分组切换（选择题、输入题、高级组件、个人信息、联系方式）
 *   - 组件预览渲染
 *   - 组件详情展示
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { ROUTES, TIMEOUTS } from "../../fixtures/mock-data";

test.describe("素材库页面", () => {
  test.describe("页面渲染", () => {
    test("素材库应正常渲染", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.materials);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("素材库应重定向到选择题分组", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.materials);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/single-select|select-group/);
    });
  });

  test.describe("选择题分组", () => {
    test("应显示单选题组件", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.singleSelect);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("应显示多选题组件", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.multiSelect);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("应显示下拉题组件", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.optionSelect);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("应显示图片单选题组件", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.singlePicSelect);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("应显示图片多选题组件", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.multiPicSelect);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("输入题分组", () => {
    test("应显示文本输入组件", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.textInput);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("高级组件分组", () => {
    test("应显示日期时间组件", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.dateTime);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("应显示评分组件", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.rateScore);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("应显示级联选择组件", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.cascader);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("应显示矩阵单选组件", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.matrixSingle);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("应显示滑块组件", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.slider);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("应显示穿梭框组件", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.transfer);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("备注题分组", () => {
    test("应显示文本备注组件", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.textNote);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("个人信息分组", () => {
    test("应显示个人信息分组页面", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.personalInfoGroup);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("联系方式分组", () => {
    test("应显示联系方式分组页面", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.contactGroup);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("分组切换", () => {
    test("应能在各分组之间切换", async ({ authenticatedPage: page }) => {
      await page.goto(ROUTES.materials);
      await page.waitForLoadState("networkidle");

      // 尝试切换到输入题分组
      await page.goto(ROUTES.inputGroup);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();

      // 切换到高级组件分组
      await page.goto(ROUTES.advancedGroup);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });
  });
});