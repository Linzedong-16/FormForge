import { expect, type Page } from "@playwright/test";
import { ROUTES, TIMEOUTS } from "../fixtures/mock-data";

/**
 * 导航辅助函数
 */

/** 验证当前是否在指定路由 */
export async function assertRoute(page: Page, expectedPath: string) {
  await page.waitForURL(`**${expectedPath}`, { timeout: TIMEOUTS.navigation });
}

/** 验证页面是否包含指定文本 */
export async function assertPageContainsText(page: Page, text: string) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).toContainText(text, { timeout: TIMEOUTS.medium });
}

/** 验证页面标题 */
export async function assertPageTitle(page: Page, expectedTitle: string) {
  await expect(page).toHaveTitle(expectedTitle, { timeout: TIMEOUTS.medium });
}

/** 点击导航链接并等待跳转 */
export async function navigateTo(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

/** 验证元素存在且可见 */
export async function assertVisible(page: Page, selector: string) {
  const el = page.locator(selector).first();
  await expect(el).toBeVisible({ timeout: TIMEOUTS.medium });
}

/** 等待并点击元素 */
export async function clickElement(page: Page, selector: string) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: "visible", timeout: TIMEOUTS.medium });
  await el.click();
}

/** 验证表单验证错误消息 */
export async function assertFormError(page: Page, errorText: string) {
  await expect(page.locator("body")).toContainText(errorText, { timeout: TIMEOUTS.short });
}

/** 截取页面截图（调试用） */
export async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screenshots/${name}.png`, fullPage: true });
}
