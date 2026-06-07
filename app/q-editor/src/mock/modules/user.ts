/**
 * 用户/管理员模块 Mock — 匹配后端 /api/admin/* 接口
 */
import type { MockMethod } from "vite-plugin-mock";
import { ok, fail, log } from "../_utils";

// ─── 安全解包 ────────────────────────────────────────────────

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

// ─── Mock 数据 ────────────────────────────────────────────────

interface MockUserItem {
  id: string;
  email: string;
  username: string;
  role: string;
  status: number;
  created_at: string;
  last_login_at: string | null;
}

const userList: MockUserItem[] = [
  {
    id: "1",
    email: "admin@example.com",
    username: "系统管理员",
    role: "admin",
    status: 1,
    created_at: "2026-01-01T00:00:00Z",
    last_login_at: "2026-06-07T08:30:00Z"
  },
  {
    id: "2",
    email: "user@example.com",
    username: "测试用户",
    role: "user",
    status: 1,
    created_at: "2026-03-15T12:00:00Z",
    last_login_at: "2026-06-06T18:00:00Z"
  },
  {
    id: "3",
    email: "disabled@test.com",
    username: "已禁用用户",
    role: "user",
    status: 0,
    created_at: "2026-02-20T09:00:00Z",
    last_login_at: null
  }
];

const systemConfig = {
  smtp: {
    smtp_enabled: "true",
    smtp_host: "smtp.example.com",
    smtp_port: "587",
    smtp_username: "noreply@example.com",
    smtp_password: "***",
    smtp_from_email: "noreply@example.com"
  },
  auth: {
    registration_enabled: "true",
    registration_mode: "email_verify",
    jwt_secret: "***",
    jwt_access_expire: "3600",
    jwt_refresh_expire: "604800"
  }
};

log("user 模块已加载", `(${userList.length} 个 Mock 用户)`);

export const userMocks: MockMethod[] = [
  // ════════════════════════════════════════════════════════════
  // POST /api/admin/users
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/admin/users",
    method: "post",
    response: (req: unknown) => {
      const b = getBody(req);
      const email = (b.email as string) || "";
      const username = (b.username as string) || "";
      const role = (b.role as string) || "";
      const password = b.password as string | undefined;
      log("POST /api/admin/users", { email, username, role });

      if (!email || !username || !role) return fail(400, "邮箱、用户名和角色不能为空");
      if (userList.some(u => u.email === email)) return fail(1001, "该邮箱已被注册");

      const item: MockUserItem = {
        id: String(userList.length + 1),
        email,
        username,
        role,
        status: 1,
        created_at: new Date().toISOString(),
        last_login_at: null
      };
      userList.push(item);

      const out: Record<string, unknown> = { ...item, passwordProvided: !!password };
      if (!password) out.generatedPassword = "AutoGen@123";
      return ok(out, "用户创建成功");
    }
  },

  // ════════════════════════════════════════════════════════════
  // GET /api/admin/users
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/admin/users",
    method: "get",
    response: (req: unknown) => {
      const q = getQuery(req);
      const page = Math.max(1, Number(q.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
      log("GET /api/admin/users", { page, limit });

      let filtered = [...userList];
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
  },

  // ════════════════════════════════════════════════════════════
  // PUT /api/admin/users/:id
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/admin/users/:id",
    method: "put",
    response: (req: unknown) => {
      const params = getParams(req);
      const id = params?.id;
      const idx = userList.findIndex(u => u.id === id);
      if (idx === -1 || !id) return fail(404, "用户不存在");

      const b = getBody(req);
      log("PUT /api/admin/users/:id", { id, updates: Object.keys(b) });

      if (b.username !== undefined) userList[idx]!.username = b.username as string;
      if (b.role !== undefined) userList[idx]!.role = b.role as string;
      if (b.status !== undefined) userList[idx]!.status = b.status as number;

      return ok(userList[idx], "用户更新成功");
    }
  },

  // ════════════════════════════════════════════════════════════
  // DELETE /api/admin/users/:id
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/admin/users/:id",
    method: "delete",
    response: (req: unknown) => {
      const params = getParams(req);
      const id = params?.id;
      const idx = userList.findIndex(u => u.id === id);
      if (idx === -1 || !id) return fail(404, "用户不存在");
      log("DELETE /api/admin/users/:id", { id });

      userList.splice(idx, 1);
      return ok({ id, deleted: true }, "用户已删除");
    }
  },

  // ════════════════════════════════════════════════════════════
  // GET /api/admin/config
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/admin/config",
    method: "get",
    response: () => {
      log("GET /api/admin/config");
      return ok(systemConfig);
    }
  },

  // ════════════════════════════════════════════════════════════
  // PUT /api/admin/config/smtp
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/admin/config/smtp",
    method: "put",
    response: (req: unknown) => {
      const b = getBody(req);
      log("PUT /api/admin/config/smtp");

      if (!b.host || !b.port || !b.username || !b.fromEmail) return fail(400, "SMTP 配置信息不完整");

      systemConfig.smtp.smtp_enabled = String(b.enabled ?? true);
      systemConfig.smtp.smtp_host = b.host as string;
      systemConfig.smtp.smtp_port = String(b.port);
      systemConfig.smtp.smtp_username = b.username as string;
      systemConfig.smtp.smtp_from_email = b.fromEmail as string;

      return ok({ updated: true }, "SMTP 配置已更新");
    }
  }
];
