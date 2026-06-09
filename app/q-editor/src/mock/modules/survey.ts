/**
 * 问卷模块 Mock — 匹配后端 /api/surveys/* 接口
 *
 * 响应格式严格对齐后端统一结构 { data, code, msg }（code=0 成功，非 0 失败）
 *
 * 覆盖接口：
 *   POST   /api/surveys                  创建问卷
 *   GET    /api/surveys                  获取问卷列表（分页 + 筛选）
 *   GET    /api/surveys/:id              获取问卷详情（含组件）
 *   PUT    /api/surveys/:id              更新问卷
 *   DELETE /api/surveys/:id              删除问卷
 *   POST   /api/surveys/:id/publish      发布问卷
 *   POST   /api/surveys/:id/close        关闭问卷
 *   POST   /api/surveys/:id/responses    提交答卷
 *   GET    /api/surveys/:id/responses    获取答卷列表
 */
import type { MockMethod } from "vite-plugin-mock";
import { ok, fail, uid, log } from "../_utils";

// ─── 安全解包工具（与 user.ts 保持一致） ─────────────────────

function getBody(req: unknown): Record<string, unknown> {
  return (
    (req && typeof req === "object" && "body" in (req as Record<string, unknown>)
      ? ((req as Record<string, unknown>).body as Record<string, unknown>)
      : {}) || {}
  );
}

function getQuery(req: unknown): Record<string, string | undefined> {
  return (
    (req && typeof req === "object" && "query" in (req as Record<string, unknown>)
      ? ((req as Record<string, unknown>).query as Record<string, string | undefined>)
      : {}) || {}
  );
}

function getParams(req: unknown): Record<string, string | undefined> {
  return (
    (req && typeof req === "object" && "params" in (req as Record<string, unknown>)
      ? ((req as Record<string, unknown>).params as Record<string, string | undefined>)
      : {}) || {}
  );
}

// ─── 内存 Mock 数据库 ──────────────────────────────────────────

interface MockComponent {
  id: string;
  survey_id: string;
  type: string;
  config: Record<string, unknown>;
  order_index: number;
  required: 0 | 1;
  created_at: string;
  updated_at: string;
}

interface MockSurvey {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: 0 | 1 | 2;
  page_size: number;
  total_questions: number;
  responses_count: number;
  is_public: 0 | 1;
  access_code: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  closed_at: string | null;
  components: MockComponent[];
}

interface MockResponse {
  id: string;
  survey_id: string;
  user_id: string | null;
  anonymous_id: string | null;
  status: 0 | 1;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  answers: Array<{ component_id: string; value?: string; values?: string[] }>;
}

const surveyStore: MockSurvey[] = [];
const responseStore: MockResponse[] = [];

/** 统计答题型组件数量（过滤展示型 text_type / text_note） */
function countQuestions(components: MockComponent[]): number {
  return components.filter(c => c.type !== "text_type" && c.type !== "text_note").length;
}

log("survey 模块已加载", "(内存数据库初始化完成)");

// ─── Mock 接口 ─────────────────────────────────────────────────

export const surveyMocks: MockMethod[] = [
  // ════════════════════════════════════════════════════════════
  // POST /api/surveys — 创建问卷
  // 接收 CreateSurveyRequest，返回 CreateSurveyResponse
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/surveys",
    method: "post",
    response: (req: unknown) => {
      const b = getBody(req);
      const title = String(b.title ?? "").trim();
      const description = b.description !== undefined ? String(b.description) : null;
      const page_size = Number(b.page_size) || 10;
      const is_public: 0 | 1 = b.is_public === 0 ? 0 : 1;
      const access_code = b.access_code !== undefined ? String(b.access_code) : null;
      const rawComponents = Array.isArray(b.components) ? (b.components as Array<Record<string, unknown>>) : [];

      log("POST /api/surveys", { title, componentCount: rawComponents.length });

      if (!title) return fail(400, "问卷标题不能为空");
      if (rawComponents.length === 0) return fail(400, "请至少添加一个组件");

      const surveyId = uid();
      const now = new Date().toISOString();

      const components: MockComponent[] = rawComponents.map((c, i) => ({
        id: uid(),
        survey_id: surveyId,
        type: String(c.type ?? "unknown"),
        config: (c.config as Record<string, unknown>) ?? {},
        order_index: typeof c.order_index === "number" ? c.order_index : i,
        required: c.required === 1 ? 1 : 0,
        created_at: now,
        updated_at: now
      }));

      const survey: MockSurvey = {
        id: surveyId,
        user_id: "1",
        title,
        description,
        status: 0,
        page_size,
        total_questions: countQuestions(components),
        responses_count: 0,
        is_public,
        access_code,
        created_at: now,
        updated_at: now,
        published_at: null,
        closed_at: null,
        components
      };

      surveyStore.push(survey);
      log("问卷已创建", { survey_id: surveyId, total_questions: survey.total_questions });

      // 返回 CreateSurveyResponse
      return ok({ survey_id: surveyId, title: survey.title, status: survey.status, created_at: now }, "问卷创建成功");
    }
  },

  // ════════════════════════════════════════════════════════════
  // GET /api/surveys — 问卷列表
  // 支持分页、关键词、状态筛选
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/surveys",
    method: "get",
    response: (req: unknown) => {
      const q = getQuery(req);
      const page = Math.max(1, Number(q.page) || 1);
      const page_size = Math.min(50, Math.max(1, Number(q.page_size) || 10));
      const keyword = q.keyword || "";
      const statusFilter = q.status !== undefined && q.status !== "" ? Number(q.status) : undefined;

      log("GET /api/surveys", { page, page_size, keyword });

      let list = [...surveyStore];
      if (keyword) list = list.filter(s => s.title.includes(keyword));
      if (statusFilter !== undefined) list = list.filter(s => s.status === statusFilter);

      const total = list.length;
      // 返回轻量列表（不含 components）
      const surveys = list
        .slice((page - 1) * page_size, page * page_size)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ components: _components, ...rest }) => rest);

      return ok({ surveys, total, page, page_size });
    }
  },

  // ════════════════════════════════════════════════════════════
  // GET /api/surveys/:id — 问卷详情（含组件列表）
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/surveys/:id",
    method: "get",
    response: (req: unknown) => {
      const { id } = getParams(req);
      log("GET /api/surveys/:id", { id });

      const survey = surveyStore.find(s => s.id === id);
      if (!survey) return fail(404, "问卷不存在");

      return ok(survey);
    }
  },

  // ════════════════════════════════════════════════════════════
  // PUT /api/surveys/:id — 更新问卷（部分更新，components 全量替换）
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/surveys/:id",
    method: "put",
    response: (req: unknown) => {
      const { id } = getParams(req);
      const idx = surveyStore.findIndex(s => s.id === id);
      if (idx === -1 || !id) return fail(404, "问卷不存在");

      const b = getBody(req);
      const survey = surveyStore[idx]!;
      const now = new Date().toISOString();

      log("PUT /api/surveys/:id", { id, fields: Object.keys(b) });

      if (b.title !== undefined) survey.title = String(b.title);
      if (b.description !== undefined) survey.description = b.description ? String(b.description) : null;
      if (b.status !== undefined) survey.status = Number(b.status) as 0 | 1 | 2;
      if (b.page_size !== undefined) survey.page_size = Number(b.page_size);
      if (b.is_public !== undefined) survey.is_public = b.is_public === 0 ? 0 : 1;
      if (b.access_code !== undefined) survey.access_code = b.access_code ? String(b.access_code) : null;

      if (Array.isArray(b.components)) {
        const raw = b.components as Array<Record<string, unknown>>;
        survey.components = raw.map((c, i) => ({
          id: uid(),
          survey_id: id,
          type: String(c.type ?? "unknown"),
          config: (c.config as Record<string, unknown>) ?? {},
          order_index: typeof c.order_index === "number" ? c.order_index : i,
          required: c.required === 1 ? 1 : 0,
          created_at: survey.created_at,
          updated_at: now
        }));
        survey.total_questions = countQuestions(survey.components);
      }

      survey.updated_at = now;
      return ok(survey, "问卷更新成功");
    }
  },

  // ════════════════════════════════════════════════════════════
  // DELETE /api/surveys/:id — 删除问卷
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/surveys/:id",
    method: "delete",
    response: (req: unknown) => {
      const { id } = getParams(req);
      const idx = surveyStore.findIndex(s => s.id === id);
      if (idx === -1 || !id) return fail(404, "问卷不存在");

      log("DELETE /api/surveys/:id", { id });
      surveyStore.splice(idx, 1);
      return ok(null, "问卷已删除");
    }
  },

  // ════════════════════════════════════════════════════════════
  // POST /api/surveys/:id/publish — 发布问卷（status 0 → 1）
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/surveys/:id/publish",
    method: "post",
    response: (req: unknown) => {
      const { id } = getParams(req);
      const survey = surveyStore.find(s => s.id === id);
      if (!survey) return fail(404, "问卷不存在");
      if (survey.status === 1) return fail(400, "问卷已处于发布状态");

      log("POST /api/surveys/:id/publish", { id });
      const now = new Date().toISOString();
      survey.status = 1;
      survey.published_at = now;
      survey.updated_at = now;

      return ok(survey, "问卷发布成功");
    }
  },

  // ════════════════════════════════════════════════════════════
  // POST /api/surveys/:id/close — 关闭问卷（status → 2）
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/surveys/:id/close",
    method: "post",
    response: (req: unknown) => {
      const { id } = getParams(req);
      const survey = surveyStore.find(s => s.id === id);
      if (!survey) return fail(404, "问卷不存在");
      if (survey.status === 2) return fail(400, "问卷已处于关闭状态");

      log("POST /api/surveys/:id/close", { id });
      const now = new Date().toISOString();
      survey.status = 2;
      survey.closed_at = now;
      survey.updated_at = now;

      return ok(survey, "问卷已关闭");
    }
  },

  // ════════════════════════════════════════════════════════════
  // POST /api/surveys/:id/responses — 提交答卷
  // 接收 SubmitResponseRequest，返回 SubmitResponseResponse
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/surveys/:id/responses",
    method: "post",
    response: (req: unknown) => {
      const { id: surveyId } = getParams(req);
      const survey = surveyStore.find(s => s.id === surveyId);
      if (!survey) return fail(404, "问卷不存在");
      if (survey.status !== 1) return fail(400, "问卷未发布，暂不接受答卷");

      const b = getBody(req);
      const rawAnswers = Array.isArray(b.answers) ? (b.answers as Array<Record<string, unknown>>) : [];
      const anonymous_id = b.anonymous_id ? String(b.anonymous_id) : null;

      log("POST /api/surveys/:id/responses", { surveyId, answerCount: rawAnswers.length });

      const now = new Date().toISOString();
      const responseId = uid();

      const response: MockResponse = {
        id: responseId,
        survey_id: surveyId!,
        user_id: null,
        anonymous_id,
        status: 1,
        submitted_at: now,
        created_at: now,
        updated_at: now,
        answers: rawAnswers.map(a => ({
          component_id: String(a.component_id ?? ""),
          value: a.value !== undefined ? String(a.value) : undefined,
          values: Array.isArray(a.values) ? (a.values as string[]) : undefined
        }))
      };

      responseStore.push(response);
      survey.responses_count += 1;

      return ok({ response_id: responseId, submitted_at: now }, "答卷提交成功");
    }
  },

  // ════════════════════════════════════════════════════════════
  // GET /api/surveys/:id/responses — 答卷列表
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/surveys/:id/responses",
    method: "get",
    response: (req: unknown) => {
      const { id: surveyId } = getParams(req);
      const survey = surveyStore.find(s => s.id === surveyId);
      if (!survey) return fail(404, "问卷不存在");

      const q = getQuery(req);
      const page = Math.max(1, Number(q.page) || 1);
      const page_size = Math.min(50, Math.max(1, Number(q.page_size) || 10));

      log("GET /api/surveys/:id/responses", { surveyId, page, page_size });

      const all = responseStore.filter(r => r.survey_id === surveyId);
      const total = all.length;
      const responses = all.slice((page - 1) * page_size, page * page_size).map(r => ({
        id: r.id,
        survey_id: r.survey_id,
        survey_title: survey.title,
        user_id: r.user_id,
        anonymous_id: r.anonymous_id,
        status: r.status,
        submitted_at: r.submitted_at,
        created_at: r.created_at
      }));

      return ok({ responses, total, page, page_size });
    }
  }
];
