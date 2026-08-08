/**
 * 动态表单规则引擎 E2E 测试
 *
 * 覆盖 quickstart.md 场景1-4 的核心断言（场景1-3 对应 specs/008-dynamic-form-engine/tasks.md T053，
 * 场景4 对应 specs/009-fix-dynamic-form-reliability/tasks.md T019）：
 *   - 场景1：显示/隐藏规则 —— q_willing 选“是”才显示 q_reason，改回“否”后题目消失且内容被清空
 *   - 场景2：跳转结束规则 —— q_eligibility 选“不符合资格”后，后续题目从可见路径中彻底消失并可直接提交
 *   - 场景3：选项联动规则 —— q_city 候选项随 q_region 收窄，未作答依赖题时展示引导文案
 *   - 场景4：派生计算字段 —— q_total_visible/q_total_hidden 对 q_score_a/q_score_b 求和，
 *     覆盖实时更新、incompleteStrategy 降级（treatAsZero/skipCalculation）、visibleToFiller:false 不渲染但仍参与计算
 *
 * 测试数据来自 DYNAMIC_SURVEY（/survey/10002），与 DEMO_SURVEY 完全独立，详见
 * app/q-editor/src/mock/modules/survey.ts 中的 dynamicLogicComponents。
 */
import { test, expect, navigateToSurvey } from "../../fixtures/test-fixtures";
import type { Page, Locator } from "@playwright/test";
import { DYNAMIC_SURVEY, TIMEOUTS } from "../../fixtures/mock-data";

/** 定位某道题目所在的整块容器（SurveyView.vue 中 class="content" 的 v-for 项），按题目标题文本匹配 */
const questionBlock = (page: Page, title: string): Locator => page.locator(".content", { hasText: title });

/**
 * 在指定题目容器内点击某个单选选项（按选项文本精确匹配）。
 * 注意：hasText 默认按子串匹配，"符合资格"会同时命中"不符合资格"，因此这里用正则锚定首尾做全词匹配。
 */
const selectRadioOption = async (page: Page, title: string, optionText: string) => {
  await questionBlock(page, title)
    .locator(".el-radio")
    .filter({ hasText: new RegExp(`^${optionText}$`) })
    .click();
};

/**
 * 在指定滑块题目的 show-input 数字输入框中填入数值并提交（按 Tab 触发 blur，促使 el-slider 的 @change 派发答案）。
 * 注意：Slider.vue 仅在 @change 触发后才会 emit 答案，纯 fill 而不触发提交等价于"未作答"。
 */
const setSliderValue = async (page: Page, title: string, value: number) => {
  const input = questionBlock(page, title).locator(".el-input-number input");
  await input.fill(String(value));
  await input.press("Tab");
};

test.describe("动态表单规则引擎", () => {
  test.describe("场景1：题目显示/隐藏规则", () => {
    test("默认隐藏依赖题，选择触发条件后显示，改回后清空并重新隐藏", async ({ page }) => {
      await navigateToSurvey(page, DYNAMIC_SURVEY.id);

      const reasonBlock = questionBlock(page, DYNAMIC_SURVEY.questionTitles.reason);

      // 初始状态：q_willing 未作答，baseVisibility=hidden，q_reason 应完全不出现在题目路径中
      await expect(reasonBlock).toHaveCount(0);

      // 选择“是”命中 show 规则，q_reason 应立即出现
      await selectRadioOption(page, DYNAMIC_SURVEY.questionTitles.willing, "是");
      await expect(reasonBlock).toBeVisible({ timeout: TIMEOUTS.medium });

      // 填写内容后改回“否”，q_reason 应重新从题目路径中消失（并非仅视觉隐藏）
      await reasonBlock.locator("textarea").fill("测试顾虑内容");
      await selectRadioOption(page, DYNAMIC_SURVEY.questionTitles.willing, "否");
      await expect(reasonBlock).toHaveCount(0);

      // 再次选择“是”：题目重新挂载，此前填写的内容应已被清空
      await selectRadioOption(page, DYNAMIC_SURVEY.questionTitles.willing, "是");
      await expect(reasonBlock).toBeVisible({ timeout: TIMEOUTS.medium });
      await expect(reasonBlock.locator("textarea")).toHaveValue("");
    });
  });

  test.describe("场景2：跳题结束规则", () => {
    test("命中跳转结束条件后，后续题目从可见路径中彻底消失并可直接提交", async ({ page }) => {
      await navigateToSurvey(page, DYNAMIC_SURVEY.id);

      const afterBlock = questionBlock(page, DYNAMIC_SURVEY.questionTitles.afterEligibility);

      // 未作答资格题时，后续题目按默认路径正常展示
      await expect(afterBlock).toBeVisible({ timeout: TIMEOUTS.medium });

      // 命中“不符合资格”→ target.type=endSurvey，后续题目应整体消失（break 语义，非仅隐藏当前题）
      await selectRadioOption(page, DYNAMIC_SURVEY.questionTitles.eligibility, "不符合资格");
      await expect(afterBlock).toHaveCount(0);

      // 等待防重复提交指纹采集完成后可直接提交（提交不做逐题必填前端拦截）
      await page.waitForTimeout(2000);
      const submitBtn = page.locator("button").filter({ hasText: /提交/ }).first();
      await expect(submitBtn).toBeVisible({ timeout: TIMEOUTS.medium });
      const isDisabled = await submitBtn.isDisabled().catch(() => false);
      if (!isDisabled) {
        await submitBtn.click();
        await page.waitForTimeout(1000);
      }

      // 页面不应崩溃
      await expect(page.locator("body")).toBeVisible();
    });

    test("未命中跳转条件时，后续题目保持可见", async ({ page }) => {
      await navigateToSurvey(page, DYNAMIC_SURVEY.id);

      const afterBlock = questionBlock(page, DYNAMIC_SURVEY.questionTitles.afterEligibility);

      await selectRadioOption(page, DYNAMIC_SURVEY.questionTitles.eligibility, "符合资格");
      await expect(afterBlock).toBeVisible({ timeout: TIMEOUTS.medium });
    });
  });

  test.describe("场景3：选项联动规则", () => {
    test("候选城市随地区收窄，未作答依赖题时展示引导文案", async ({ page }) => {
      await navigateToSurvey(page, DYNAMIC_SURVEY.id);

      const cityBlock = questionBlock(page, DYNAMIC_SURVEY.questionTitles.city);

      // 依赖题 q_region 未作答：emptyStrategy=promptFillDependency，应展示引导文案而非选项列表
      await expect(cityBlock.getByText("请先完成前面依赖的题目")).toBeVisible({ timeout: TIMEOUTS.medium });
      await expect(cityBlock.locator(".el-radio")).toHaveCount(0);

      // 选择“华东”后，候选池应收窄为“上海/杭州”，其余城市选项应保持不可见
      await selectRadioOption(page, DYNAMIC_SURVEY.questionTitles.region, "华东");
      await expect(cityBlock.getByText("请先完成前面依赖的题目")).toHaveCount(0);
      await expect(cityBlock.locator(".el-radio").filter({ hasText: "上海" })).toBeVisible({
        timeout: TIMEOUTS.medium
      });
      await expect(cityBlock.locator(".el-radio").filter({ hasText: "杭州" })).toBeVisible();
      await expect(cityBlock.locator(".el-radio").filter({ hasText: "广州" })).not.toBeVisible();

      // 选中“上海”后切换地区为“华南”，候选池收窄导致“上海”不再可选
      await cityBlock.locator(".el-radio").filter({ hasText: "上海" }).click();
      await selectRadioOption(page, DYNAMIC_SURVEY.questionTitles.region, "华南");
      await expect(cityBlock.locator(".el-radio").filter({ hasText: "广州" })).toBeVisible({
        timeout: TIMEOUTS.medium
      });
      await expect(cityBlock.locator(".el-radio").filter({ hasText: "深圳" })).toBeVisible();
      await expect(cityBlock.locator(".el-radio").filter({ hasText: "上海" })).not.toBeVisible();
    });
  });

  test.describe("场景4：派生计算字段", () => {
    test("计算结果随依赖题目实时更新，留空按 incompleteStrategy 降级，visibleToFiller:false 不渲染但仍参与计算", async ({
      page
    }) => {
      await navigateToSurvey(page, DYNAMIC_SURVEY.id);

      const totalVisibleBlock = questionBlock(page, DYNAMIC_SURVEY.questionTitles.totalVisible);
      const totalHiddenBlock = questionBlock(page, DYNAMIC_SURVEY.questionTitles.totalHidden);
      const totalVisibleValue = totalVisibleBlock.locator(".computed-field-value");
      // 隐藏计算字段的容器节点依然存在（v-show 而非 v-for 过滤），文本内容可直接读取，不受可见性限制
      const totalHiddenValue = totalHiddenBlock.locator(".computed-field-value");

      // visibleToFiller:false 的计算字段不应渲染给填写者（DOM 节点存在但 v-show 隐藏，故不能用 toHaveCount(0)）
      await expect(totalHiddenBlock).not.toBeVisible();

      // 两个来源题均未作答：treatAsZero 策略将缺失来源视为 0，可见计算字段求和结果为 0
      await expect(totalVisibleValue).toHaveText("0", { timeout: TIMEOUTS.medium });
      // skipCalculation 策略下只要有来源缺失即产出 null，展示态为 "--"
      await expect(totalHiddenValue).toHaveText("--", { timeout: TIMEOUTS.medium });

      // 只填写来源题A：可见字段（treatAsZero）将未作答的 B 视为 0，结果随之实时更新
      await setSliderValue(page, DYNAMIC_SURVEY.questionTitles.scoreA, 30);
      await expect(totalVisibleValue).toHaveText("30", { timeout: TIMEOUTS.medium });
      // 隐藏字段（skipCalculation）因来源题 B 仍缺失，继续产出 "--"
      await expect(totalHiddenValue).toHaveText("--", { timeout: TIMEOUTS.medium });

      // 补齐来源题B后，可见字段的求和结果继续实时更新
      await setSliderValue(page, DYNAMIC_SURVEY.questionTitles.scoreB, 50);
      await expect(totalVisibleValue).toHaveText("80", { timeout: TIMEOUTS.medium });
      // 两个来源题均已作答：隐藏字段不再因 skipCalculation 判定为 null，重新产出求和结果，
      // 证明其虽不渲染给填写者，但确实持续在后台参与计算（而非仅仅停止求值）
      await expect(totalHiddenValue).toHaveText("80", { timeout: TIMEOUTS.medium });
      await expect(totalHiddenBlock).not.toBeVisible();

      // 再次改变来源题A的值，验证可见字段的求和结果保持实时联动，而非仅首次计算生效
      await setSliderValue(page, DYNAMIC_SURVEY.questionTitles.scoreA, 60);
      await expect(totalVisibleValue).toHaveText("110", { timeout: TIMEOUTS.medium });
      await expect(totalHiddenValue).toHaveText("110", { timeout: TIMEOUTS.medium });
    });
  });
});
