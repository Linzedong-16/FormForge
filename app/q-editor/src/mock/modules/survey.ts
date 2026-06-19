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

// ─── 安全解包工具 ────────────────────────────────────────────

type ReqObj = Record<string, unknown>;

function getBody(req: unknown): Record<string, unknown> {
  try {
    const r = req as ReqObj | null | undefined;
    return (r?.body as Record<string, unknown>) || {};
  } catch {
    return {};
  }
}

function getQuery(req: unknown): Record<string, string | undefined> {
  try {
    const r = req as ReqObj | null | undefined;
    return (r?.query as Record<string, string | undefined>) || {};
  } catch {
    return {};
  }
}

/** 获取路径参数 — 优先 vite-plugin-mock 的 params，回退到 URL 解析 */
function getParams(req: unknown, pathSegments: string[]): Record<string, string> {
  const r = req as ReqObj | null | undefined;
  const result: Record<string, string> = {};

  // 1) 尝试 vite-plugin-mock 的 params 字段
  const direct = r?.params as Record<string, string> | undefined;
  if (direct) {
    for (const key of pathSegments) {
      if (direct[key]) {
        result[key] = direct[key];
        return result;
      }
    }
  }

  // 2) 尝试从 URL 中提取（回退方案）
  const url = (r?.url as string) || "";
  // 匹配 /api/surveys/:id 或 /api/surveys/:id/responses 或 /api/responses/:id
  const patterns = [/\/api\/surveys\/([^/?]+)/, /\/api\/responses\/([^/?]+)/];
  const key = pathSegments[0];
  if (!key) return result;
  for (const p of patterns) {
    const m = url.match(p);
    if (m) {
      result[key] = m[1]!;
      return result;
    }
  }

  return result;
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

/** 统计答题型组件数量（过滤展示型 text_note 组件） */
function countQuestions(components: MockComponent[]): number {
  return components.filter(c => c.type !== "text_note").length;
}

// ─── 预填充 Demo 问卷（开发阶段跨页面刷新免丢失） ──────────────

const DEMO_SURVEY_ID = "demo_survey_01";
const DEMO_NOW = new Date().toISOString();

const demoComponents: MockComponent[] = [
  // ── 标题组件 (text-note currentStatus=0) ──
  {
    id: "demo_comp_01",
    survey_id: DEMO_SURVEY_ID,
    type: "text_note",
    config: {
      type: { currentStatus: 0, status: [0, 1], isShow: false, name: "text-type-editor" },
      title: { status: "2026 年度员工满意度调查", isShow: true, name: "title-editor" },
      desc: { status: "", isShow: true, name: "desc-editor" },
      position: {
        currentStatus: 1,
        status: ["左对齐", "居中"],
        isShow: true,
        name: "position-editor"
      },
      titleSize: {
        currentStatus: 2,
        status: ["22", "20", "18"],
        isShow: true,
        name: "size-editor"
      },
      descSize: {
        currentStatus: 0,
        status: ["16", "14", "12"],
        isShow: true,
        name: "size-editor"
      },
      titleWeight: {
        currentStatus: 0,
        status: ["粗体", "正常"],
        isShow: true,
        name: "weight-editor"
      },
      descWeight: {
        currentStatus: 1,
        status: ["粗体", "正常"],
        isShow: true,
        name: "weight-editor"
      },
      titleItalic: {
        currentStatus: 1,
        status: ["斜体", "正常"],
        isShow: true,
        name: "italic-editor"
      },
      descItalic: {
        currentStatus: 1,
        status: ["斜体", "正常"],
        isShow: true,
        name: "italic-editor"
      },
      titleColor: { status: "#18181b", isShow: true, name: "color-editor" },
      descColor: { status: "#909399", isShow: true, name: "color-editor" }
    },
    order_index: 0,
    required: 0,
    created_at: DEMO_NOW,
    updated_at: DEMO_NOW
  },
  // ── 描述段落 (text-note currentStatus=1) ──
  {
    id: "demo_comp_02",
    survey_id: DEMO_SURVEY_ID,
    type: "text_note",
    config: {
      type: { currentStatus: 1, status: [0, 1], isShow: false, name: "text-type-editor" },
      title: { status: "", isShow: true, name: "title-editor" },
      desc: {
        status: "感谢您抽出时间参与本次调查，您的反馈对我们至关重要！",
        isShow: true,
        name: "desc-editor"
      },
      position: {
        currentStatus: 1,
        status: ["左对齐", "居中"],
        isShow: true,
        name: "position-editor"
      },
      titleSize: {
        currentStatus: 0,
        status: ["22", "20", "18"],
        isShow: true,
        name: "size-editor"
      },
      descSize: {
        currentStatus: 0,
        status: ["16", "14", "12"],
        isShow: true,
        name: "size-editor"
      },
      titleWeight: {
        currentStatus: 1,
        status: ["粗体", "正常"],
        isShow: true,
        name: "weight-editor"
      },
      descWeight: {
        currentStatus: 1,
        status: ["粗体", "正常"],
        isShow: true,
        name: "weight-editor"
      },
      titleItalic: {
        currentStatus: 1,
        status: ["斜体", "正常"],
        isShow: true,
        name: "italic-editor"
      },
      descItalic: {
        currentStatus: 1,
        status: ["斜体", "正常"],
        isShow: true,
        name: "italic-editor"
      },
      titleColor: { status: "#18181b", isShow: true, name: "color-editor" },
      descColor: { status: "#71717a", isShow: true, name: "color-editor" }
    },
    order_index: 1,
    required: 0,
    created_at: DEMO_NOW,
    updated_at: DEMO_NOW
  },
  // ── 单选题 ──
  {
    id: "demo_comp_03",
    survey_id: DEMO_SURVEY_ID,
    type: "single_select",
    config: {
      type: {
        currentStatus: 2,
        status: [2, 3, 10, 4],
        isShow: false,
        name: "text-type-editor"
      },
      title: { status: "您对目前工作环境的满意程度？", isShow: true, name: "title-editor" },
      desc: { status: "", isShow: true, name: "desc-editor" },
      options: {
        status: ["非常满意", "比较满意", "一般", "不太满意"],
        currentStatus: 0,
        isShow: true,
        name: "options-editor"
      },
      position: {
        currentStatus: 0,
        status: ["左对齐", "居中"],
        isShow: true,
        name: "position-editor"
      },
      titleSize: {
        currentStatus: 0,
        status: ["22", "20", "18"],
        isShow: true,
        name: "size-editor"
      },
      descSize: {
        currentStatus: 0,
        status: ["16", "14", "12"],
        isShow: true,
        name: "size-editor"
      },
      titleWeight: {
        currentStatus: 0,
        status: ["粗体", "正常"],
        isShow: true,
        name: "weight-editor"
      },
      descWeight: {
        currentStatus: 1,
        status: ["粗体", "正常"],
        isShow: true,
        name: "weight-editor"
      },
      titleItalic: {
        currentStatus: 1,
        status: ["斜体", "正常"],
        isShow: true,
        name: "italic-editor"
      },
      descItalic: {
        currentStatus: 1,
        status: ["斜体", "正常"],
        isShow: true,
        name: "italic-editor"
      },
      titleColor: { status: "#18181b", isShow: true, name: "color-editor" },
      descColor: { status: "#909399", isShow: true, name: "color-editor" }
    },
    order_index: 2,
    required: 1,
    created_at: DEMO_NOW,
    updated_at: DEMO_NOW
  },
  // ── 多选题 ──
  {
    id: "demo_comp_04",
    survey_id: DEMO_SURVEY_ID,
    type: "multi_select",
    config: {
      type: {
        currentStatus: 3,
        status: [2, 3, 10, 4],
        isShow: false,
        name: "text-type-editor"
      },
      title: {
        status: "您希望公司在哪些方面做出改善？（可多选）",
        isShow: true,
        name: "title-editor"
      },
      desc: { status: "", isShow: true, name: "desc-editor" },
      options: {
        status: ["薪资福利", "晋升机制", "工作氛围", "培训学习", "弹性工作"],
        currentStatus: 0,
        isShow: true,
        name: "options-editor"
      },
      position: {
        currentStatus: 0,
        status: ["左对齐", "居中"],
        isShow: true,
        name: "position-editor"
      },
      titleSize: {
        currentStatus: 0,
        status: ["22", "20", "18"],
        isShow: true,
        name: "size-editor"
      },
      descSize: {
        currentStatus: 0,
        status: ["16", "14", "12"],
        isShow: true,
        name: "size-editor"
      },
      titleWeight: {
        currentStatus: 0,
        status: ["粗体", "正常"],
        isShow: true,
        name: "weight-editor"
      },
      descWeight: {
        currentStatus: 1,
        status: ["粗体", "正常"],
        isShow: true,
        name: "weight-editor"
      },
      titleItalic: {
        currentStatus: 1,
        status: ["斜体", "正常"],
        isShow: true,
        name: "italic-editor"
      },
      descItalic: {
        currentStatus: 1,
        status: ["斜体", "正常"],
        isShow: true,
        name: "italic-editor"
      },
      titleColor: { status: "#18181b", isShow: true, name: "color-editor" },
      descColor: { status: "#909399", isShow: true, name: "color-editor" }
    },
    order_index: 3,
    required: 1,
    created_at: DEMO_NOW,
    updated_at: DEMO_NOW
  },
  // ── 文本输入 ──
  {
    id: "demo_comp_05",
    survey_id: DEMO_SURVEY_ID,
    type: "text_input",
    config: {
      type: { currentStatus: 4, status: [4], isShow: false, name: "text-type-editor" },
      title: { status: "请留下您的其他建议或意见", isShow: true, name: "title-editor" },
      desc: { status: "", isShow: true, name: "desc-editor" },
      placeholder: {
        status: "请在此输入...",
        isShow: true,
        name: "text-input-type-editor"
      },
      position: {
        currentStatus: 0,
        status: ["左对齐", "居中"],
        isShow: true,
        name: "position-editor"
      },
      titleSize: {
        currentStatus: 0,
        status: ["22", "20", "18"],
        isShow: true,
        name: "size-editor"
      },
      descSize: {
        currentStatus: 0,
        status: ["16", "14", "12"],
        isShow: true,
        name: "size-editor"
      },
      titleWeight: {
        currentStatus: 0,
        status: ["粗体", "正常"],
        isShow: true,
        name: "weight-editor"
      },
      descWeight: {
        currentStatus: 1,
        status: ["粗体", "正常"],
        isShow: true,
        name: "weight-editor"
      },
      titleItalic: {
        currentStatus: 1,
        status: ["斜体", "正常"],
        isShow: true,
        name: "italic-editor"
      },
      descItalic: {
        currentStatus: 1,
        status: ["斜体", "正常"],
        isShow: true,
        name: "italic-editor"
      },
      titleColor: { status: "#18181b", isShow: true, name: "color-editor" },
      descColor: { status: "#909399", isShow: true, name: "color-editor" }
    },
    order_index: 4,
    required: 0,
    created_at: DEMO_NOW,
    updated_at: DEMO_NOW
  }
];

surveyStore.push({
  id: DEMO_SURVEY_ID,
  user_id: "1",
  title: "2026 年度员工满意度调查",
  description: "感谢您抽出时间参与本次调查，您的反馈对我们至关重要",
  status: 1, // 已发布，可直接填写
  page_size: 10,
  total_questions: countQuestions(demoComponents),
  responses_count: 3,
  is_public: 1,
  access_code: null,
  created_at: DEMO_NOW,
  updated_at: DEMO_NOW,
  published_at: DEMO_NOW,
  closed_at: null,
  components: demoComponents
});

// 预填充几条历史答卷
responseStore.push({
  id: "demo_resp_01",
  survey_id: DEMO_SURVEY_ID,
  user_id: null,
  anonymous_id: "anon_01",
  status: 1,
  submitted_at: DEMO_NOW,
  created_at: DEMO_NOW,
  updated_at: DEMO_NOW,
  answers: [
    { component_value: "非常满意" },
    { component_values: ["薪资福利", "弹性工作"] },
    { component_value: "希望增加团建活动" }
  ]
});

log("survey 模块已加载", `(Demo 问卷: /survey/${DEMO_SURVEY_ID}, ${demoComponents.length} 组件, 1 份答卷)`);

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
      const id = getParams(req, ["id"]).id || "";
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
      const id = getParams(req, ["id"]).id || "";
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
      const id = getParams(req, ["id"]).id || "";
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
      const id = getParams(req, ["id"]).id || "";
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
      const id = getParams(req, ["id"]).id || "";
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
      const surveyId = getParams(req, ["id"]).id || "";
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
      const surveyId = getParams(req, ["id"]).id || "";
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
