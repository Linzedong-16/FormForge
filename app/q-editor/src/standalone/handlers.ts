/**
 * 独立部署 Mock 请求处理器
 *
 * 根据请求 URL + Method 匹配并返回对应的 Mock 响应。
 * 覆盖所有关键 API 端点，确保 GitHub Pages 静态演示功能完整。
 */
import type { AxiosRequestConfig } from "axios";
import {
  users,
  demoProfile,
  surveyStore,
  responseStore,
  templateStore,
  adminUsers,
  systemConfig,
  systemStatus,
  messageStore,
  MOCK_TOKEN,
  MOCK_REFRESH_TOKEN,
  MOCK_TOKEN_EXPIRES_IN,
  MOCK_REFRESH_EXPIRES_IN,
  DEMO_AVATAR_URL,
  uid,
  ok,
  fail,
  log
} from "./data";
import type { MockMessage } from "./data";

// ─── 类型 ─────────────────────────────────────────────────────────

type ReqBody = Record<string, unknown>;

// ─── 安全解包请求参数 ──────────────────────────────────────────

function parseBody(config: AxiosRequestConfig): ReqBody {
  if (typeof config.data === "string") {
    try {
      return JSON.parse(config.data);
    } catch {
      return {};
    }
  }
  return (config.data as ReqBody) ?? {};
}

function parseQuery(config: AxiosRequestConfig): Record<string, string | undefined> {
  return (config.params as Record<string, string | undefined>) ?? {};
}

/** 从 URL 中提取路径参数（如 /api/surveys/:id → { id: "xxx" }） */
function extractPathParams(pattern: string, url: string): Record<string, string> {
  const result: Record<string, string> = {};
  const patternParts = pattern.split("/");
  const urlParts = url.replace(/\?.*$/, "").split("/");

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i]?.startsWith(":")) {
      const key = patternParts[i]!.slice(1);
      result[key] = urlParts[i] ?? "";
    }
  }
  return result;
}

/** 检查 URL 是否匹配模式（支持 :param 动态段） */
function matchUrl(pattern: string, url: string): boolean {
  const cleanUrl = url.replace(/\?.*$/, "");
  const patternParts = pattern.split("/");
  const urlParts = cleanUrl.split("/");

  if (patternParts.length !== urlParts.length) return false;

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i]?.startsWith(":")) continue; // 动态参数段
    if (patternParts[i] !== urlParts[i]) return false;
  }
  return true;
}

// ─── 响应工具 ────────────────────────────────────────────────────

function makeLoginResponse(userId: string) {
  const user = users.find(u => u.id === userId);
  if (!user) return fail(401, "用户不存在");

  return ok(
    {
      token: MOCK_TOKEN,
      tokenType: "Bearer",
      expiresIn: MOCK_TOKEN_EXPIRES_IN,
      refreshToken: MOCK_REFRESH_TOKEN,
      refreshExpiresIn: MOCK_REFRESH_EXPIRES_IN,
      user: { id: user.id, email: user.email, username: user.username, role: user.role }
    },
    "登录成功"
  );
}

// ════════════════════════════════════════════════════════════════
//  请求处理路由表
// ════════════════════════════════════════════════════════════════

export function handleRequest(config: AxiosRequestConfig): Record<string, unknown> | null {
  const url = config.url ?? "";
  const method = (config.method ?? "get").toLowerCase();

  // ─── 认证模块 /api/auth/* ──────────────────────────────────────

  // GET /api/auth/status
  if (url === "/api/auth/status" && method === "get") {
    log("GET /api/auth/status");
    return ok(systemStatus);
  }

  // POST /api/auth/login
  if (url === "/api/auth/login" && method === "post") {
    const body = parseBody(config);
    log("POST /api/auth/login", { email: body.email });
    const email = String(body.email ?? "");
    const password = String(body.password ?? "");

    if (!email || !password) return fail(400, "邮箱和密码不能为空");

    const user = users.find(u => u.email === email);
    if (!user || user.password !== password) {
      return { data: { remainAttempts: 4 }, code: 401, msg: "邮箱或密码错误" };
    }
    if (user.status === 0) return fail(1006, "账户已被禁用，请联系管理员");

    return makeLoginResponse(user.id);
  }

  // POST /api/auth/send-code
  if (url === "/api/auth/send-code" && method === "post") {
    const body = parseBody(config);
    log("POST /api/auth/send-code", { email: body.email, type: body.type });
    const email = String(body.email ?? "");
    const type = String(body.type ?? "");

    if (!email || !type) return fail(400, "邮箱和验证码类型不能为空");
    if (!["register", "reset_password", "bind_email", "change_password"].includes(type))
      return fail(400, "无效的验证码类型");
    if (type === "register" && users.some(u => u.email === email)) return fail(1001, "该邮箱已被注册");

    return ok({ expireSeconds: 300 }, "验证码已发送");
  }

  // POST /api/auth/register（初始化注册 — 首个超管）
  if (url === "/api/auth/register" && method === "post") {
    const body = parseBody(config);
    log("POST /api/auth/register", { email: body.email });

    const email = String(body.email ?? "");
    const password = String(body.password ?? "");
    const username = String(body.username ?? "");

    if (!email || !password) return fail(400, "邮箱和密码不能为空");
    if (users.some(u => u.role === "super_admin")) return fail(403, "系统已初始化");
    if (users.some(u => u.email === email)) return fail(1001, "该邮箱已被注册");

    const newUser = {
      id: String(users.length + 1),
      email,
      username: username || email.split("@")[0] || "新用户",
      password,
      role: "super_admin" as const,
      status: 1
    };
    users.push(newUser);
    return makeLoginResponse(newUser.id);
  }

  // POST /api/auth/verify-register
  if (url === "/api/auth/verify-register" && method === "post") {
    const body = parseBody(config);
    log("POST /api/auth/verify-register", { email: body.email });

    const email = String(body.email ?? "");
    const code = String(body.code ?? "");
    const password = String(body.password ?? "");
    const username = String(body.username ?? "");

    if (!email || !code || !password) return fail(400, "邮箱、验证码和密码不能为空");
    if (code !== "123456") return fail(1003, "验证码错误");
    if (users.some(u => u.email === email)) return fail(1001, "该邮箱已被注册");

    const newUser = {
      id: String(users.length + 1),
      email,
      username: username || email.split("@")[0] || "新用户",
      password,
      role: "user" as const,
      status: 1
    };
    users.push(newUser);
    return makeLoginResponse(newUser.id);
  }

  // POST /api/auth/refresh
  if (url === "/api/auth/refresh" && method === "post") {
    log("POST /api/auth/refresh");
    const body = parseBody(config);
    if (!body.refreshToken) return fail(400, "Refresh Token 不能为空");
    return makeLoginResponse("1");
  }

  // POST /api/auth/reset-password
  if (url === "/api/auth/reset-password" && method === "post") {
    const body = parseBody(config);
    log("POST /api/auth/reset-password", { email: body.email });

    const email = String(body.email ?? "");
    const code = String(body.code ?? "");
    const pwd = String(body.newPassword ?? "");

    if (!email || !code || !pwd) return fail(400, "邮箱、验证码和新密码不能为空");
    if (code !== "123456") return fail(1003, "验证码错误");

    const user = users.find(u => u.email === email);
    if (user) user.password = pwd;
    return ok(null, "密码重置成功");
  }

  // POST /api/auth/logout
  if (url === "/api/auth/logout" && method === "post") {
    log("POST /api/auth/logout");
    return ok(null, "已退出登录");
  }

  // ─── 当前用户 /api/user/* ──────────────────────────────────────

  // GET /api/user/me
  if (url === "/api/user/me" && method === "get") {
    log("GET /api/user/me");
    const adminUser = users[0]!;
    return ok({
      id: adminUser.id,
      email: adminUser.email,
      username: adminUser.username,
      role: adminUser.role,
      status: adminUser.status,
      created_at: "2026-01-01T00:00:00Z",
      last_login_at: new Date().toISOString()
    });
  }

  // PUT /api/user/update
  if (url === "/api/user/update" && method === "put") {
    const body = parseBody(config);
    log("PUT /api/user/update", body);
    return ok(
      {
        id: "1",
        email: users[0]!.email,
        username: String(body.username ?? users[0]!.username),
        role: users[0]!.role,
        status: 1,
        created_at: "2026-01-01T00:00:00Z",
        last_login_at: new Date().toISOString()
      },
      "用户信息已更新"
    );
  }

  // GET /api/user/profile
  if (url === "/api/user/profile" && method === "get") {
    log("GET /api/user/profile");
    return ok(demoProfile);
  }

  // PUT /api/user/profile
  if (url === "/api/user/profile" && method === "put") {
    const body = parseBody(config);
    log("PUT /api/user/profile", body);
    // 同步更新内存中的 profile 数据
    if (body.nickname !== undefined) demoProfile.nickname = String(body.nickname);
    if (body.occupation !== undefined) demoProfile.occupation = String(body.occupation);
    if (body.bio !== undefined) demoProfile.bio = String(body.bio);
    if (Array.isArray(body.interests)) demoProfile.interests = body.interests as string[];
    return ok(
      {
        nickname: demoProfile.nickname,
        occupation: demoProfile.occupation,
        bio: demoProfile.bio,
        interests: demoProfile.interests
      },
      "资料已更新"
    );
  }

  // POST /api/user/avatar — 头像上传
  if (url === "/api/user/avatar" && method === "post") {
    log("POST /api/user/avatar (standalone — 返回固定 CDN URL)");
    return ok(
      {
        avatarUrl: DEMO_AVATAR_URL,
        thumbnailUrl: DEMO_AVATAR_URL
      },
      "头像上传成功（演示模式）"
    );
  }

  // PUT /api/user/change-password
  if (url === "/api/user/change-password" && method === "put") {
    const body = parseBody(config);
    log("PUT /api/user/change-password", { hasCurrentPwd: !!body.currentPassword });
    return ok(null, "密码修改成功");
  }

  // POST /api/user/bind-email
  if (url === "/api/user/bind-email" && method === "post") {
    log("POST /api/user/bind-email");
    return ok({ email: demoProfile.email, verified: true }, "邮箱绑定成功");
  }

  // DELETE /api/user/account
  if (url === "/api/user/account" && method === "delete") {
    log("DELETE /api/user/account");
    return ok({ deletedAt: new Date().toISOString() }, "账号已注销");
  }

  // ─── 问卷模块 /api/surveys/* ────────────────────────────────────

  // POST /api/surveys — 创建问卷
  if (url === "/api/surveys" && method === "post") {
    const body = parseBody(config);
    const title = String(body.title ?? "").trim();
    log("POST /api/surveys", { title });

    if (!title) return fail(400, "问卷标题不能为空");

    const surveyId = uid();
    const now = new Date().toISOString();
    const rawComponents = Array.isArray(body.components) ? (body.components as Array<Record<string, unknown>>) : [];

    const components = rawComponents.map((c, i) => ({
      id: uid(),
      survey_id: surveyId,
      type: String(c.type ?? "unknown"),
      config: (c.config as Record<string, unknown>) ?? {},
      order_index: typeof c.order_index === "number" ? c.order_index : i,
      required: c.required === 1 ? (1 as const) : (0 as const),
      created_at: now,
      updated_at: now
    }));

    const survey = {
      id: surveyId,
      user_id: "1",
      title,
      description: body.description ? String(body.description) : null,
      status: 0 as const,
      page_size: Number(body.page_size) || 10,
      total_questions: components.filter(c => c.type !== "text_note").length,
      responses_count: 0,
      is_public: body.is_public === 0 ? (0 as const) : (1 as const),
      access_code: body.access_code ? String(body.access_code) : null,
      created_at: now,
      updated_at: now,
      published_at: null,
      closed_at: null,
      components,
      review_status: "none"
    };

    surveyStore.push(survey as any);
    log("问卷已创建", { survey_id: surveyId });
    return ok({ survey_id: surveyId, title: survey.title, status: 0, created_at: now }, "问卷创建成功");
  }

  // GET /api/surveys — 问卷列表
  if (url === "/api/surveys" && method === "get") {
    const q = parseQuery(config);
    const page = Math.max(1, Number(q.page) || 1);
    const page_size = Math.min(50, Math.max(1, Number(q.page_size) || 10));
    log("GET /api/surveys", { page, page_size });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const surveys = surveyStore.map(({ components: _c, ...rest }) => rest);
    const total = surveys.length;
    const paged = surveys.slice((page - 1) * page_size, page * page_size);

    return ok({ surveys: paged, total, page, page_size });
  }

  // GET /api/surveys/:id — 问卷详情
  if (matchUrl("/api/surveys/:id", url) && method === "get") {
    const { id } = extractPathParams("/api/surveys/:id", url);
    log("GET /api/surveys/:id", { id });

    const survey = surveyStore.find(s => s.id === id);
    if (!survey) return fail(404, "问卷不存在");
    return ok(survey);
  }

  // GET /api/surveys/:id/public — 公开问卷详情（C端）
  if (matchUrl("/api/surveys/:id/public", url) && method === "get") {
    const { id } = extractPathParams("/api/surveys/:id/public", url);
    log("GET /api/surveys/:id/public", { id });

    const survey = surveyStore.find(s => s.id === id);
    if (!survey || survey.status !== 1) return fail(404, "问卷不存在或未发布");
    return ok(survey);
  }

  // PUT /api/surveys/:id — 更新问卷
  if (matchUrl("/api/surveys/:id", url) && method === "put") {
    const rawId = extractPathParams("/api/surveys/:id", url).id;
    if (!rawId) return fail(400, "缺少问卷 ID");
    const id: string = rawId;
    const survey = surveyStore.find(s => s.id === id);
    if (!survey) return fail(404, "问卷不存在");

    const body = parseBody(config);
    log("PUT /api/surveys/:id", { id, fields: Object.keys(body) });

    const now = new Date().toISOString();
    if (body.title !== undefined) survey.title = String(body.title);
    if (body.description !== undefined) survey.description = body.description ? String(body.description) : null;
    if (body.status !== undefined) survey.status = Number(body.status) as 0 | 1 | 2;
    if (body.page_size !== undefined) survey.page_size = Number(body.page_size);
    survey.updated_at = now;

    if (Array.isArray(body.components)) {
      const raw = body.components as Array<Record<string, unknown>>;
      survey.components = raw.map((c, i) => ({
        id: uid(),
        survey_id: id,
        type: String(c.type ?? "unknown"),
        config: (c.config as Record<string, unknown>) ?? {},
        order_index: typeof c.order_index === "number" ? c.order_index : i,
        required: c.required === 1 ? (1 as const) : (0 as const),
        created_at: survey.created_at,
        updated_at: now
      }));
      survey.total_questions = survey.components.filter(c => c.type !== "text_note").length;
    }

    return ok(survey, "问卷更新成功");
  }

  // DELETE /api/surveys/:id
  if (matchUrl("/api/surveys/:id", url) && method === "delete") {
    const { id } = extractPathParams("/api/surveys/:id", url);
    const idx = surveyStore.findIndex(s => s.id === id);
    if (idx === -1) return fail(404, "问卷不存在");

    log("DELETE /api/surveys/:id", { id });
    surveyStore.splice(idx, 1);
    return ok(null, "问卷已删除");
  }

  // POST /api/surveys/:id/publish
  if (matchUrl("/api/surveys/:id/publish", url) && method === "post") {
    const { id } = extractPathParams("/api/surveys/:id/publish", url);
    const survey = surveyStore.find(s => s.id === id);
    if (!survey) return fail(404, "问卷不存在");

    log("POST /api/surveys/:id/publish", { id });
    const now = new Date().toISOString();
    survey.status = 1;
    survey.published_at = now;
    survey.updated_at = now;
    return ok(survey, "问卷发布成功");
  }

  // POST /api/surveys/:id/close
  if (matchUrl("/api/surveys/:id/close", url) && method === "post") {
    const { id } = extractPathParams("/api/surveys/:id/close", url);
    const survey = surveyStore.find(s => s.id === id);
    if (!survey) return fail(404, "问卷不存在");

    log("POST /api/surveys/:id/close", { id });
    const now = new Date().toISOString();
    survey.status = 2;
    survey.closed_at = now;
    survey.updated_at = now;
    return ok(survey, "问卷已关闭");
  }

  // POST /api/surveys/:id/apply-template
  if (matchUrl("/api/surveys/:id/apply-template", url) && method === "post") {
    const { id } = extractPathParams("/api/surveys/:id/apply-template", url);
    log("POST /api/surveys/:id/apply-template", { id });
    return ok({ applied: true, templateId: "tpl_001" }, "模板申请已提交");
  }

  // POST /api/surveys/:id/submit-review
  if (matchUrl("/api/surveys/:id/submit-review", url) && method === "post") {
    const { id } = extractPathParams("/api/surveys/:id/submit-review", url);
    log("POST /api/surveys/:id/submit-review", { id });
    return ok({ submitted: true, status: "pending" }, "审核已提交");
  }

  // GET /api/surveys/:id/token — 临时提交凭证
  if (matchUrl("/api/surveys/:id/token", url) && method === "get") {
    const { id } = extractPathParams("/api/surveys/:id/token", url);
    log("GET /api/surveys/:id/token", { id });
    return ok({ token: `standalone_token_${Date.now()}`, expires_in: 1800 });
  }

  // POST /api/surveys/:id/generate-link
  if (matchUrl("/api/surveys/:id/generate-link", url) && method === "post") {
    const { id } = extractPathParams("/api/surveys/:id/generate-link", url);
    log("POST /api/surveys/:id/generate-link", { id });
    return ok(
      {
        link: `${window.location.origin}/survey/${id}`,
        expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
      },
      "链接已生成"
    );
  }

  // ─── 答卷 /api/surveys/:id/responses ────────────────────────────

  // GET /api/surveys/:id/responses — 答卷列表
  if (matchUrl("/api/surveys/:id/responses", url) && method === "get") {
    const { id } = extractPathParams("/api/surveys/:id/responses", url);
    const q = parseQuery(config);
    const page = Math.max(1, Number(q.page) || 1);
    const page_size = Math.min(50, Math.max(1, Number(q.page_size) || 10));

    log("GET /api/surveys/:id/responses", { surveyId: id, page, page_size });

    const all = responseStore.filter(r => r.survey_id === id);
    const total = all.length;
    const survey = surveyStore.find(s => s.id === id);
    const responses = all.slice((page - 1) * page_size, page * page_size).map(r => ({
      id: r.id,
      survey_id: r.survey_id,
      survey_title: survey?.title ?? "",
      user_id: r.user_id,
      anonymous_id: r.anonymous_id,
      status: r.status,
      submitted_at: r.submitted_at,
      created_at: r.created_at
    }));

    return ok({ responses, total, page, page_size });
  }

  // POST /api/surveys/:id/responses — 提交答卷
  if (matchUrl("/api/surveys/:id/responses", url) && method === "post") {
    const { id } = extractPathParams("/api/surveys/:id/responses", url);
    const survey = surveyStore.find(s => s.id === id);
    if (!survey) return fail(404, "问卷不存在");

    const body = parseBody(config);
    const rawAnswers = Array.isArray(body.answers) ? (body.answers as Array<Record<string, unknown>>) : [];

    log("POST /api/surveys/:id/responses", { surveyId: id, answerCount: rawAnswers.length });

    const now = new Date().toISOString();
    const responseId = uid();
    const response = {
      id: responseId,
      survey_id: id,
      user_id: null,
      anonymous_id: body.anonymous_id ? String(body.anonymous_id) : null,
      status: 1 as const,
      submitted_at: now,
      created_at: now,
      updated_at: now,
      answers: rawAnswers.map(a => ({
        component_id: String(a.component_id ?? ""),
        value: a.value !== undefined ? String(a.value) : undefined,
        values: Array.isArray(a.values) ? (a.values as string[]) : undefined
      }))
    } as any;

    responseStore.push(response);
    survey.responses_count += 1;

    return ok({ response_id: responseId, submitted_at: now }, "答卷提交成功");
  }

  // ─── 答卷详情 /api/responses/:id ───────────────────────────────

  // GET /api/responses/:id
  if (matchUrl("/api/responses/:id", url) && method === "get") {
    const { id } = extractPathParams("/api/responses/:id", url);
    log("GET /api/responses/:id", { id });
    const resp = responseStore.find(r => r.id === id);
    if (!resp) return fail(404, "答卷不存在");
    return ok(resp);
  }

  // DELETE /api/responses/:id
  if (matchUrl("/api/responses/:id", url) && method === "delete") {
    const { id } = extractPathParams("/api/responses/:id", url);
    const idx = responseStore.findIndex(r => r.id === id);
    if (idx === -1) return fail(404, "答卷不存在");
    log("DELETE /api/responses/:id", { id });
    responseStore.splice(idx, 1);
    return ok(null, "答卷已删除");
  }

  // ─── 模板 /api/templates/* ─────────────────────────────────────

  // GET /api/templates
  if (url === "/api/templates" && method === "get") {
    const q = parseQuery(config);
    const page = Math.max(1, Number(q.page) || 1);
    const page_size = Math.min(50, Math.max(1, Number(q.page_size) || 10));
    log("GET /api/templates", { page, page_size });

    const total = templateStore.length;
    const items = templateStore
      .slice((page - 1) * page_size, page * page_size)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ components: _c, ...rest }) => rest);

    return ok({ templates: items, total, page, page_size });
  }

  // GET /api/templates/:id
  if (matchUrl("/api/templates/:id", url) && method === "get") {
    const { id } = extractPathParams("/api/templates/:id", url);
    log("GET /api/templates/:id", { id });
    const template = templateStore.find(t => t.id === id);
    if (!template) return fail(404, "模板不存在");
    return ok(template);
  }

  // POST /api/templates/:id/apply — 使用模板创建问卷
  if (matchUrl("/api/templates/:id/apply", url) && method === "post") {
    const { id } = extractPathParams("/api/templates/:id/apply", url);
    log("POST /api/templates/:id/apply", { templateId: id });
    const surveyId = uid();
    return ok({ survey_id: surveyId, title: "从模板创建的问卷", status: 0 }, "模板应用成功");
  }

  // POST /api/templates/:id/rate — 模板评分
  if (matchUrl("/api/templates/:id/rate", url) && method === "post") {
    const { id } = extractPathParams("/api/templates/:id/rate", url);
    log("POST /api/templates/:id/rate", { templateId: id });
    return ok({ rated: true, avg_rating: 4.5 }, "评分成功");
  }

  // ─── 管理后台 /api/admin/* ─────────────────────────────────────

  // GET /api/admin/users — 用户列表
  if (url === "/api/admin/users" && method === "get") {
    const q = parseQuery(config);
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    log("GET /api/admin/users", { page, limit });

    let filtered = [...adminUsers];
    if (q.email) filtered = filtered.filter(u => u.email.includes(q.email!));
    if (q.status !== undefined && q.status !== "") filtered = filtered.filter(u => u.status === Number(q.status));

    const total = filtered.length;
    return ok({
      items: filtered.slice((page - 1) * limit, page * limit),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  }

  // POST /api/admin/users — 创建用户
  if (url === "/api/admin/users" && method === "post") {
    const body = parseBody(config);
    log("POST /api/admin/users", body);

    const email = String(body.email ?? "");
    const username = String(body.username ?? "");
    if (!email || !username) return fail(400, "邮箱和用户名不能为空");

    const newUser = {
      id: String(adminUsers.length + 1),
      email,
      username,
      role: "user",
      status: 1,
      created_at: new Date().toISOString(),
      last_login_at: null,
      isBanned: false,
      banRemaining: null,
      isDeleted: false
    };
    adminUsers.push(newUser);

    return ok(
      {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        role: "user" as const,
        status: 1 as const,
        defaultPassword: "AutoGen@123",
        requirePasswordChange: true
      },
      "用户创建成功"
    );
  }

  // PUT /api/admin/users/:id — 更新用户
  if (matchUrl("/api/admin/users/:id", url) && method === "put") {
    const { id } = extractPathParams("/api/admin/users/:id", url);
    const user = adminUsers.find(u => u.id === id);
    if (!user) return fail(404, "用户不存在");

    const body = parseBody(config);
    log("PUT /api/admin/users/:id", { id, updates: Object.keys(body) });

    if (body.username !== undefined) user.username = String(body.username);
    if (body.role !== undefined) user.role = String(body.role);
    if (body.status !== undefined) user.status = Number(body.status);

    return ok(user, "用户更新成功");
  }

  // DELETE /api/admin/users/:id — 删除用户
  if (matchUrl("/api/admin/users/:id", url) && method === "delete") {
    const { id } = extractPathParams("/api/admin/users/:id", url);
    const idx = adminUsers.findIndex(u => u.id === id);
    if (idx === -1) return fail(404, "用户不存在");

    log("DELETE /api/admin/users/:id", { id });
    adminUsers.splice(idx, 1);
    return ok({ id, deleted: true, deletedBy: "1", deletedAt: new Date().toISOString() }, "用户已删除");
  }

  // GET /api/admin/config
  if (url === "/api/admin/config" && method === "get") {
    log("GET /api/admin/config");
    return ok(systemConfig);
  }

  // PUT /api/admin/config/smtp
  if (url === "/api/admin/config/smtp" && method === "put") {
    log("PUT /api/admin/config/smtp");
    return ok({ updated: true }, "SMTP 配置已更新");
  }

  // ─── 消息模块 /api/messages/* ──────────────────────────────────

  // GET /api/messages/unread-count — 未读消息计数
  if (url === "/api/messages/unread-count" && method === "get") {
    log("GET /api/messages/unread-count");
    const unread = messageStore.filter(m => !m.is_read);
    const by_type: Record<string, number> = {
      operation_notify: 0,
      template_like: 0,
      survey_lifecycle: 0,
      user_admin_comm: 0,
      admin_broadcast: 0
    };
    unread.forEach(m => {
      by_type[m.type] += 1;
    });

    return ok({ unread_total: unread.length, by_type });
  }

  // GET /api/messages — 收件箱列表（支持 type 逗号筛选 / is_read 筛选 / 分页）
  if (url === "/api/messages" && method === "get") {
    const q = parseQuery(config);
    const page = Math.max(1, Number(q.page) || 1);
    const page_size = Math.min(50, Math.max(1, Number(q.page_size) || 20));
    log("GET /api/messages", { page, page_size, type: q.type, is_read: q.is_read });

    let filtered = [...messageStore];
    if (q.type) {
      const types = q.type.split(",");
      filtered = filtered.filter(m => types.includes(m.type));
    }
    if (q.is_read !== undefined && q.is_read !== "") {
      filtered = filtered.filter(m => m.is_read === (q.is_read === "true"));
    }
    // 按创建时间倒序展示最新消息
    filtered = [...filtered].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    const total = filtered.length;
    const items = filtered.slice((page - 1) * page_size, page * page_size);

    return ok({ items, total, page, page_size, total_pages: Math.max(1, Math.ceil(total / page_size)) });
  }

  // PUT /api/messages/read-all — 全部标记已读（可选按类型筛选）
  if (url === "/api/messages/read-all" && method === "put") {
    const body = parseBody(config);
    const type = body.type as string | undefined;
    log("PUT /api/messages/read-all", { type });

    const now = new Date().toISOString();
    let marked_count = 0;
    messageStore.forEach(m => {
      if (!m.is_read && (!type || m.type === type)) {
        m.is_read = true;
        m.read_at = now;
        marked_count += 1;
      }
    });

    return ok({ marked_count }, "已全部标记为已读");
  }

  // PUT /api/messages/:id/read — 标记单条已读
  if (matchUrl("/api/messages/:id/read", url) && method === "put") {
    const { id } = extractPathParams("/api/messages/:id/read", url);
    const message = messageStore.find(m => m.id === id);
    if (!message) return fail(404, "消息不存在");

    log("PUT /api/messages/:id/read", { id });
    message.is_read = true;
    message.read_at = new Date().toISOString();

    return ok({ id, is_read: true, read_at: message.read_at }, "已标记为已读");
  }

  // DELETE /api/messages/:id — 软删除单条消息
  if (matchUrl("/api/messages/:id", url) && method === "delete") {
    const { id } = extractPathParams("/api/messages/:id", url);
    const idx = messageStore.findIndex(m => m.id === id);
    if (idx === -1) return fail(404, "消息不存在");

    log("DELETE /api/messages/:id", { id });
    messageStore.splice(idx, 1);

    return ok({ id, deleted: true }, "消息已删除");
  }

  // POST /api/messages/send — 用户向管理员发送消息
  if (url === "/api/messages/send" && method === "post") {
    const body = parseBody(config);
    const content = String(body.content ?? "").trim();
    if (!content) return fail(400, "消息内容不能为空");

    log("POST /api/messages/send", { content });
    const id = uid();
    const created_at = new Date().toISOString();
    const newMessage: MockMessage = {
      id,
      type: "user_admin_comm",
      title: "用户咨询",
      content,
      sender: { id: "1", name: "我" },
      is_read: true,
      related_resource: (body.related_resource as MockMessage["related_resource"]) ?? null,
      related_resource_id: body.related_resource_id !== undefined ? String(body.related_resource_id) : null,
      created_at,
      read_at: created_at
    };
    messageStore.unshift(newMessage);

    return ok({ id, created_at }, "发送成功");
  }

  // ════════════════════════════════════════════════════════════════
  //  未匹配的路由
  // ════════════════════════════════════════════════════════════════

  console.warn(`[Standalone Mock] 未匹配的路由: ${method.toUpperCase()} ${url}`);
  return null;
}
