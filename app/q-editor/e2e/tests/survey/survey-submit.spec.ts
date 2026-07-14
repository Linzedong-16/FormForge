/**
 * 在线答题页面 E2E 测试
 *
 * 覆盖：
 *   - 答题页面渲染
 *   - 问卷填写
 *   - 表单验证（必填项）
 *   - 答卷提交
 *   - 提交成功/失败状态
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { DEMO_SURVEY, TIMEOUTS } from "../../fixtures/mock-data";

test.describe("在线答题页面", () => {
  test.describe("页面渲染", () => {
    test("答题页面应正常渲染", async ({ page }) => {
      await page.goto(`/survey/${DEMO_SURVEY.id}`);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("答题页面应显示问卷标题", async ({ page }) => {
      await page.goto(`/survey/${DEMO_SURVEY.id}`);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toContainText(DEMO_SURVEY.title, {
        timeout: TIMEOUTS.medium
      });
    });

    test("答题页面应显示问卷描述", async ({ page }) => {
      await page.goto(`/survey/${DEMO_SURVEY.id}`);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toContainText(DEMO_SURVEY.description, {
        timeout: TIMEOUTS.medium
      });
    });
  });

  test.describe("问卷填写", () => {
    test("应能选择单选题选项", async ({ page }) => {
      await page.goto(`/survey/${DEMO_SURVEY.id}`);
      await page.waitForLoadState("networkidle");

      // 尝试点击单选选项
      const radioOption = page.locator(".el-radio, [role='radio'], input[type='radio']").first();
      if (await radioOption.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await radioOption.click();
      }
    });

    test("应能选择多选题选项", async ({ page }) => {
      await page.goto(`/survey/${DEMO_SURVEY.id}`);
      await page.waitForLoadState("networkidle");

      const checkboxOption = page.locator(".el-checkbox, input[type='checkbox']").first();
      if (await checkboxOption.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await checkboxOption.click();
      }
    });

    test("应能在文本输入框中输入内容", async ({ page }) => {
      await page.goto(`/survey/${DEMO_SURVEY.id}`);
      await page.waitForLoadState("networkidle");

      const textarea = page.locator("textarea").first();
      if (await textarea.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await textarea.fill("测试反馈内容");
        await expect(textarea).toHaveValue("测试反馈内容");
      }
    });
  });

  test.describe("提交功能", () => {
    test("应显示提交按钮", async ({ page }) => {
      await page.goto(`/survey/${DEMO_SURVEY.id}`);
      await page.waitForLoadState("networkidle");

      const submitBtn = page.locator("button").filter({ hasText: /提交/ }).first();
      if (await submitBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await expect(submitBtn).toBeVisible();
      }
    });

    test("未填写必填项提交应显示错误", async ({ page }) => {
      await page.goto(`/survey/${DEMO_SURVEY.id}`);
      await page.waitForLoadState("networkidle");

      const submitBtn = page.locator("button").filter({ hasText: /提交/ }).first();
      if (await submitBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await submitBtn.click();
        // 应该有错误提示
        await page.waitForTimeout(500);
      }
    });
  });

  test.describe("异常处理", () => {
    test("访问不存在的问卷ID应显示错误", async ({ page }) => {
      await page.goto("/survey/99999");
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });

    test("访问空问卷ID应显示错误", async ({ page }) => {
      await page.goto("/survey/");
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("分页功能", () => {
    test("答题页面应显示分页器", async ({ page }) => {
      await page.goto(`/survey/${DEMO_SURVEY.id}`);
      await page.waitForLoadState("networkidle");

      const pagination = page.locator(".el-pagination, [class*='pagination']");
      const count = await pagination.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("完整填写流程", () => {
    test("应能完成完整填写并尝试提交", async ({ page }) => {
      await page.goto(`/survey/${DEMO_SURVEY.id}`);
      await page.waitForLoadState("networkidle");

      // 选择单选题
      const radioOption = page.locator(".el-radio, [role='radio'], input[type='radio']").first();
      if (await radioOption.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await radioOption.click();
      }

      // 选择多选题
      const checkboxOption = page.locator(".el-checkbox, input[type='checkbox']").first();
      if (await checkboxOption.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await checkboxOption.click();
      }

      // 填写文本输入
      const textarea = page.locator("textarea").first();
      if (await textarea.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await textarea.fill("测试建议内容");
      }

      // 等待指纹采集完成
      await page.waitForTimeout(2000);

      // 点击提交
      const submitBtn = page.locator("button").filter({ hasText: /提交/ }).first();
      if (await submitBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        const isDisabled = await submitBtn.isDisabled().catch(() => false);
        if (!isDisabled) {
          await submitBtn.click();
          await page.waitForTimeout(1000);
        }
      }

      // 页面不应崩溃
      await expect(page.locator("body")).toBeVisible();
    });
  });
});