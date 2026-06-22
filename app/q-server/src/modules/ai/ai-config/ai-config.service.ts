/**
 * AI 配置管理 — 业务逻辑层
 *
 * 职责：
 *   1. 查询 AI 配置（API Key 脱敏返回）
 *   2. 更新 AI 配置（加密存储、失效缓存）
 *
 * 安全：
 *   - DeepSeek API Key 使用 AES-256-GCM 加密存储，运行时解密
 *   - 查询时仅返回脱敏 Key（sk-****abcd），防止泄露
 *   - 操作需超级管理员权限
 */
import type { FastifyInstance } from "fastify";
import { encrypt, decrypt } from "../../../utils/crypto.js";
import { createAuditLog } from "../../../utils/audit-log.js";
import { invalidateAIConfigCache } from "../../../config/langchain.js";
import type { UpdateAIConfigInput, AIConfigResponse } from "./ai-config.schemas.js";

// ─── 常量 ──────────────────────────────────────────────────────

/** system_configs 中 AI 配置的 key 集合 */
const AI_CONFIG_KEYS = ["ai_api_key", "ai_model", "ai_enabled"] as const;

/** API Key 脱敏：保留前 3 + 后 4，中间用 **** 替代 */
function maskApiKey(key: string): string {
  if (key.length <= 10) return "sk-****";
  return `${key.slice(0, 5)}****${key.slice(-4)}`;
}

// ─── AI 配置服务类 ─────────────────────────────────────────────

export class AIConfigService {
  constructor(private readonly fastify: FastifyInstance) {}

  // ============================================================
  //  查询 AI 配置
  // ============================================================

  /**
   * 获取 AI 配置（API Key 脱敏）
   *
   * @returns AI 配置详情，Key 使用 sk-****abcd 格式
   */
  async getConfig(): Promise<AIConfigResponse> {
    const configs = await this.fastify.prisma.systemConfig.findMany({
      where: { key: { in: [...AI_CONFIG_KEYS] } }
    });

    const apiKeyEnc = configs.find(c => c.key === "ai_api_key")?.value;
    const model = configs.find(c => c.key === "ai_model")?.value ?? "deepseek-chat";
    const enabled = configs.find(c => c.key === "ai_enabled")?.value === "true";

    const configured = !!apiKeyEnc;
    let apiKeyMasked = "";

    if (apiKeyEnc) {
      try {
        const plainKey = decrypt(apiKeyEnc);
        apiKeyMasked = maskApiKey(plainKey);
      } catch {
        // 密文损坏时显示脱敏异常
        apiKeyMasked = "***解密失败***";
      }
    }

    return { configured, apiKeyMasked, model, enabled };
  }

  // ============================================================
  //  更新 AI 配置
  // ============================================================

  /**
   * 更新 AI 配置（加密存储 API Key，失效模块缓存）
   *
   * @param adminId  操作管理员 ID
   * @param input    新配置
   * @returns 更新结果
   */
  async updateConfig(adminId: bigint, input: UpdateAIConfigInput) {
    // 加密 API Key（密文存储）
    const apiKeyEnc = encrypt(input.apiKey);

    const entries = [
      { key: "ai_api_key", value: apiKeyEnc, description: "DeepSeek API Key（AES-256-GCM 加密存储）" },
      { key: "ai_model", value: input.model ?? "deepseek-chat", description: "AI 模型名称" },
      { key: "ai_enabled", value: String(input.enabled), description: "是否启用 AI 生成功能" }
    ];

    // 批量 upsert（事务保证原子性）
    await this.fastify.prisma.$transaction(
      entries.map(e =>
        this.fastify.prisma.systemConfig.upsert({
          where: { key: e.key },
          update: { value: e.value, description: e.description },
          create: { ...e, category: "ai" }
        })
      )
    );

    // 失效模块缓存（使下次 createDeepSeekChat 重新查 DB）
    invalidateAIConfigCache();

    // 记录审计日志（fire-and-forget，不记录明文 Key）
    createAuditLog(this.fastify, adminId, "update_ai_config", "system_config", null, {
      model: input.model ?? "deepseek-chat",
      enabled: input.enabled,
      key_updated: true
    }).catch(() => {});

    this.fastify.log.info({ adminId: String(adminId), model: input.model }, "AI 配置已更新");

    return {
      updated: true,
      apiKeyMasked: maskApiKey(input.apiKey),
      model: input.model ?? "deepseek-chat",
      enabled: input.enabled
    };
  }
}
