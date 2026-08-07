/**
 * 问卷动态规则模块 — 服务层
 *
 * 职责：读取指定问卷全部题目的稳定引用键（client_key）/顺序（order_index）/规则配置（logic），
 * 委托给 packages/survey-engine 的纯函数 validateRuleSet() 执行发布前完整性校验
 * （循环依赖 / 悬空引用 / 非法跳转目标三类），供 T047 路由与 T048 发布拦截复用。
 * 前后端复用同一份校验算法，避免"前端预览合法、后端发布不合法"的双实现漂移风险。
 *
 * 注意：必须直接从 "monorepo-survey-engine/logic/validator.js" 子路径导入，
 * 不可从顶层包名 "monorepo-survey-engine" 或 logic 统一导出入口 "logic/index.js" 导入 ——
 * 顶层入口与 logic 统一导出入口都会传递性加载 useRuleRuntime.ts（其内部 `import { computed } from "vue"`），
 * 而 q-server 是纯 Node 后端没有 Vue 依赖，会在运行时触发 "Cannot find package 'vue'" 报错；
 * validator.ts 自身零运行时依赖（仅 `import type` 类型引用），可安全被后端直接导入。
 */

import type { FastifyInstance } from "fastify";
import { validateRuleSet } from "monorepo-survey-engine/logic/validator.js";
import type { QuestionLogicConfig, RuleValidationResult } from "monorepo-survey-engine/logic/types.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { AppError } from "../../../utils/errors.js";
import { questionLogicConfigSchema } from "./survey-rule.schemas.js";

export class SurveyRuleService {
  constructor(private readonly fastify: FastifyInstance) {}

  /**
   * 对指定问卷的全部题目规则配置执行完整性校验。
   * @param userId 当前操作用户（用于归属校验，避免越权校验他人问卷）
   * @param surveyId 问卷 ID
   * @param tx 可选的当前事务连接：发布流程需在同一次事务内完成"校验 + 更新"，
   *           避免脱离事务读取导致校验快照与实际发布数据不一致（FR-005）；
   *           省略时回退到非事务连接（如路由层单独触发的"仅校验不发布"场景）
   */
  async validateSurveyRules(
    userId: bigint,
    surveyId: bigint,
    tx: Prisma.TransactionClient | FastifyInstance["prisma"] = this.fastify.prisma
  ): Promise<RuleValidationResult> {
    const survey = await tx.survey.findFirst({
      where: { id: surveyId, user_id: userId, deleted_at: null }
    });
    if (!survey) throw new AppError("问卷不存在", 404);

    const components = await tx.surveyComponent.findMany({
      where: { survey_id: surveyId },
      orderBy: { order_index: "asc" },
      select: { client_key: true, order_index: true, logic: true }
    });

    // 仅保留具备稳定引用键的题目参与校验：未生成 client_key 的存量题目（早于本功能落地）
    // 在设计器中不可能被选中作为条件来源/跳转目标，天然不在校验全集中，也无需报 danglingReference
    const ruleComponents = components
      .filter((c): c is typeof c & { client_key: string } => c.client_key !== null)
      .map(c => ({
        clientKey: c.client_key,
        orderIndex: c.order_index,
        logic: this.parseLogic(c.client_key, c.logic)
      }));

    return validateRuleSet(ruleComponents);
  }

  /**
   * 对已持久化的 logic JSON 做兜底格式校验（防御性加固，正常写入路径已在 T011 校验过）。
   * 格式非法时记录警告并跳过该题目的规则参与校验，避免个别脏数据导致整份问卷校验流程崩溃。
   */
  private parseLogic(clientKey: string, raw: unknown): QuestionLogicConfig | null {
    if (raw === null || raw === undefined) return null;

    const parsed = questionLogicConfigSchema.safeParse(raw);
    if (!parsed.success) {
      this.fastify.log.warn(
        { clientKey, issues: parsed.error.issues },
        "题目 logic 配置格式非法，已跳过该题目的规则校验"
      );
      return null;
    }
    return parsed.data as QuestionLogicConfig;
  }
}
