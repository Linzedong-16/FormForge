/**
 * 消息模块 — 每日定时任务
 *
 * 职责：
 *   1. 消息清理：按 data-model.md §7 的保留期限分批物理删除已读/软删除的过期消息
 *      （未读消息永不清理）；广播消息删除时通过 onDelete: Cascade 级联清理
 *      MessageBroadcastState，无需额外代码
 *   2. 问卷即将过期提醒扫描：扫描 7 天内到期且未提醒过的已发布问卷，触发
 *      MessageHookService.onSurveyExpiringSoon 并回写 expiring_reminder_sent_at
 *
 * 调度机制：不引入 node-cron 依赖，复用项目里 tracking-consumer.ts 已有的原生
 * setInterval 风格（见 research.md §9）——计算下一次目标时刻（每日 03:00）的
 * 毫秒差 → setTimeout 触发 → 之后用 24 小时的 setInterval 循环。
 */

import type { FastifyInstance } from "fastify";
import { MessageHookService } from "./message-hooks.service.js";

const TARGET_HOUR = 3; // 每日 03:00（业务低峰期）
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 500;
const CLEANUP_BATCH_INTERVAL_MS = 100;

/** 各类消息的保留期限（天），对齐 data-model.md §7 */
const RETENTION_DAYS: Record<string, number> = {
  operation_notify: 180,
  template_like: 180,
  survey_lifecycle: 180,
  user_admin_comm: 365,
  admin_broadcast: 365
};

const SOFT_DELETE_RETENTION_DAYS = 30;
const EXPIRING_SOON_WINDOW_DAYS = 7;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** 分批删除，避免单次大 DELETE 长时间锁表 */
async function deleteInBatches(fastify: FastifyInstance, where: Record<string, unknown>): Promise<number> {
  let totalDeleted = 0;
  for (;;) {
    const batch = await fastify.prisma.message.findMany({ where, select: { id: true }, take: CLEANUP_BATCH_SIZE });
    if (batch.length === 0) break;

    await fastify.prisma.message.deleteMany({ where: { id: { in: batch.map(m => m.id) } } });
    totalDeleted += batch.length;

    if (batch.length < CLEANUP_BATCH_SIZE) break;
    await new Promise(resolve => setTimeout(resolve, CLEANUP_BATCH_INTERVAL_MS));
  }
  return totalDeleted;
}

/** 任务一：按保留期限清理已读/软删除的过期消息 */
async function runMessageCleanup(fastify: FastifyInstance): Promise<{ cleaned_read: number; cleaned_deleted: number }> {
  let cleanedRead = 0;
  for (const [type, days] of Object.entries(RETENTION_DAYS)) {
    cleanedRead += await deleteInBatches(fastify, {
      type,
      is_read: true,
      deleted_at: null,
      created_at: { lt: daysAgo(days) }
    });
  }

  const cleanedDeleted = await deleteInBatches(fastify, {
    deleted_at: { not: null, lt: daysAgo(SOFT_DELETE_RETENTION_DAYS) }
  });

  return { cleaned_read: cleanedRead, cleaned_deleted: cleanedDeleted };
}

/** 任务二：扫描 7 天内到期且未提醒过的已发布问卷，触发"即将过期"通知 */
async function runExpiringSoonScan(fastify: FastifyInstance): Promise<{ notified: number }> {
  const hooks = new MessageHookService(fastify);
  const windowEnd = new Date(Date.now() + EXPIRING_SOON_WINDOW_DAYS * ONE_DAY_MS);

  const surveys = await fastify.prisma.survey.findMany({
    where: {
      status: 1,
      deleted_at: null,
      expiring_reminder_sent_at: null,
      deadline: { gte: new Date(), lte: windowEnd }
    },
    select: { id: true, user_id: true, title: true, deadline: true }
  });

  let notified = 0;
  for (const survey of surveys) {
    if (!survey.deadline) continue;
    try {
      await fastify.prisma.survey.update({
        where: { id: survey.id },
        data: { expiring_reminder_sent_at: new Date() }
      });
      await hooks.onSurveyExpiringSoon(survey.user_id, survey.id, survey.title, survey.deadline);
      notified += 1;
    } catch (err) {
      fastify.log.warn({ err, surveyId: String(survey.id) }, "[message-scheduler] 即将过期提醒处理失败");
    }
  }

  return { notified };
}

async function runDailyTasks(fastify: FastifyInstance): Promise<void> {
  const startedAt = Date.now();
  try {
    const cleanupResult = await runMessageCleanup(fastify);
    const expiringResult = await runExpiringSoonScan(fastify);

    fastify.log.info(
      {
        cleaned_read: cleanupResult.cleaned_read,
        cleaned_deleted: cleanupResult.cleaned_deleted,
        expiring_notified: expiringResult.notified,
        elapsed_ms: Date.now() - startedAt,
        timestamp: new Date().toISOString()
      },
      "[message-scheduler] 每日任务执行完成"
    );
  } catch (err) {
    fastify.log.error({ err }, "[message-scheduler] 每日任务执行失败");
  }
}

function msUntilNextTargetHour(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(TARGET_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

/**
 * 启动消息模块的每日调度任务。
 *
 * 返回一个 stop 函数供测试/优雅关闭场景使用（生产环境通常无需调用，进程退出即终止）。
 */
export function startMessageScheduler(fastify: FastifyInstance): { stop: () => void } {
  let intervalHandle: ReturnType<typeof setInterval> | undefined;

  const timeoutHandle = setTimeout(() => {
    void runDailyTasks(fastify);
    intervalHandle = setInterval(() => void runDailyTasks(fastify), ONE_DAY_MS);
  }, msUntilNextTargetHour());

  fastify.log.info(
    { next_run_in_ms: msUntilNextTargetHour() },
    "[message-scheduler] 已启动，等待下一次每日 03:00 执行"
  );

  return {
    stop: () => {
      clearTimeout(timeoutHandle);
      if (intervalHandle) clearInterval(intervalHandle);
    }
  };
}

// 供测试直接调用内部实现，验证清理/提醒逻辑而不必等待真实调度时机
export const __internal = { runMessageCleanup, runExpiringSoonScan, runDailyTasks };
