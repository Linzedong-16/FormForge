/**
 * DeepSeek API 用量查询 — 业务逻辑层
 *
 * 职责：
 *   - 从 system_configs 读取加密的 DeepSeek API Key 并解密
 *   - 代理调用 DeepSeek 官方余额查询接口 GET /user/balance
 *   - 代理调用 DeepSeek 官方用量查询接口 GET /v1/usage
 *   - 格式化数据返回前端展示
 *
 * 安全：
 *   - API Key AES-256-GCM 加密存储，运行时解密
 *   - 仅超级管理员可访问
 *   - 请求 DeepSeek 超时 10s，避免阻塞
 */

import type { FastifyInstance } from "fastify";
import { decrypt } from "../../../utils/crypto.js";

// ─── 常量 ──────────────────────────────────────────────────────

const DEEPSEEK_API_BASE = "https://api.deepseek.com";

// ─── 类型 ──────────────────────────────────────────────────────

/** 余额信息 */
export interface BalanceInfo {
  currency: string;
  total_balance: string;
  granted_balance: string;
  topped_up_balance: string;
}

/** 余额查询响应 */
export interface BalanceResponse {
  is_available: boolean;
  balance_infos: BalanceInfo[];
}

/** 用量数据点 */
export interface UsageDataPoint {
  date: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  request_count: number;
}

/** 用量汇总 */
export interface UsageSummary {
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_requests: number;
}

/** 聚合的用量查询响应 */
export interface AIUsageResponse {
  balance: BalanceResponse | null;
  usage_summary: UsageSummary;
  daily_usage: UsageDataPoint[];
  /** 估算费用（CNY），基于 DeepSeek 2025 定价 */
  estimated_cost: {
    input_cost: number;
    output_cost: number;
    total_cost: number;
    currency: string;
  };
  /** 查询时间 */
  queried_at: string;
}

// ─── 定价常量（DeepSeek 2025 标准价格，单位：元/百万 Token） ────

const PRICING: Record<string, { input: number; output: number }> = {
  "deepseek-chat": { input: 2, output: 8 },
  "deepseek-reasoner": { input: 4, output: 16 },
  default: { input: 2, output: 8 }
};

// ─── Service ───────────────────────────────────────────────────

export class AIUsageService {
  constructor(private readonly fastify: FastifyInstance) {}

  /**
   * 获取解密后的 DeepSeek API Key
   */
  private async getApiKey(): Promise<string> {
    const config = await this.fastify.prisma.systemConfig.findUnique({
      where: { key: "ai_api_key" }
    });
    if (!config?.value) {
      throw new Error("DeepSeek API Key 未配置，请在系统设置 → AI 配置中设置");
    }
    return decrypt(config.value);
  }

  /**
   * 调用 DeepSeek API
   */
  private async callDeepSeek<T>(path: string, apiKey: string): Promise<T> {
    const url = `${DEEPSEEK_API_BASE}${path}`;
    const resp = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      signal: AbortSignal.timeout(10000) // 10s 超时
    });

    if (!resp.ok) {
      if (resp.status === 402) {
        throw new Error("DeepSeek 账户余额不足（402 Payment Required），请充值后重试");
      }
      if (resp.status === 401) {
        throw new Error("DeepSeek API Key 无效（401 Unauthorized），请检查配置");
      }
      const text = await resp.text().catch(() => "");
      throw new Error(`DeepSeek API 返回错误 (${resp.status}): ${text.slice(0, 200)}`);
    }

    return (await resp.json()) as T;
  }

  /**
   * 查询余额 + 用量，返回聚合数据
   *
   * @param startDate 用量查询起始日期（YYYY-MM-DD）
   * @param endDate   用量查询截止日期（YYYY-MM-DD）
   */
  async getUsage(startDate?: string, endDate?: string): Promise<AIUsageResponse> {
    // 默认查询最近 30 天
    const now = new Date();
    const end = endDate ?? now.toISOString().slice(0, 10);
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    const start = startDate ?? d.toISOString().slice(0, 10);

    const apiKey = await this.getApiKey();

    // 并行查询余额 + 用量
    const [balanceResult, usageResult] = await Promise.allSettled([
      this.callDeepSeek<BalanceResponse>("/user/balance", apiKey),
      this.callDeepSeek<{ data: Array<{ timestamp: string; prompt_tokens: number; completion_tokens: number }> }>(
        `/v1/usage?start_date=${start}&end_date=${end}`,
        apiKey
      )
    ]);

    // 余额
    let balance: BalanceResponse | null = null;
    if (balanceResult.status === "fulfilled") {
      balance = balanceResult.value;
    } else {
      this.fastify.log.warn({ err: balanceResult.reason }, "[ai-usage] 余额查询失败");
    }

    // 用量聚合
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalRequests = 0;
    const dailyMap = new Map<string, { prompt: number; completion: number; count: number }>();

    if (usageResult.status === "fulfilled" && usageResult.value?.data) {
      for (const item of usageResult.value.data) {
        totalPromptTokens += item.prompt_tokens ?? 0;
        totalCompletionTokens += item.completion_tokens ?? 0;
        totalRequests += 1;

        const date = (item.timestamp ?? "").slice(0, 10);
        if (date) {
          const entry = dailyMap.get(date) ?? { prompt: 0, completion: 0, count: 0 };
          entry.prompt += item.prompt_tokens ?? 0;
          entry.completion += item.completion_tokens ?? 0;
          entry.count += 1;
          dailyMap.set(date, entry);
        }
      }
    } else if (usageResult.status === "rejected") {
      this.fastify.log.warn({ err: usageResult.reason }, "[ai-usage] 用量查询失败");
    }

    const totalTokens = totalPromptTokens + totalCompletionTokens;

    // 转换为数组并排序
    const dailyUsage: UsageDataPoint[] = Array.from(dailyMap.entries())
      .map(([date, v]) => ({
        date,
        prompt_tokens: v.prompt,
        completion_tokens: v.completion,
        total_tokens: v.prompt + v.completion,
        request_count: v.count
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 估算费用（使用默认定价，实际可能因模型而异）
    const price = PRICING.default;
    const inputCost = (totalPromptTokens / 1_000_000) * price.input;
    const outputCost = (totalCompletionTokens / 1_000_000) * price.output;

    return {
      balance,
      usage_summary: {
        total_prompt_tokens: totalPromptTokens,
        total_completion_tokens: totalCompletionTokens,
        total_tokens: totalTokens,
        total_requests: totalRequests
      },
      daily_usage: dailyUsage,
      estimated_cost: {
        input_cost: Math.round(inputCost * 100) / 100,
        output_cost: Math.round(outputCost * 100) / 100,
        total_cost: Math.round((inputCost + outputCost) * 100) / 100,
        currency: "CNY"
      },
      queried_at: new Date().toISOString()
    };
  }
}
