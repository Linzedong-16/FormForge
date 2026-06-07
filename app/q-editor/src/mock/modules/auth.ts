/**
 * 认证模块 Mock — 匹配后端 /api/auth/* 接口
 *
 * 响应格式严格对齐后端 { data, code, msg }
 */
import type { MockMethod } from "vite-plugin-mock";
import { ok, fail, uid, log } from "../_utils";

// ─── Mock 数据 ────────────────────────────────────────────────

interface MockUser {
  id: string;
  email: string;
  username: string;
  password: string;
  role: "super_admin" | "user" | "admin";
  status: number;
}

const users: MockUser[] = [
  {
    id: "1",
    email: "admin@example.com",
    username: "系统管理员",
    password: "Admin@123",
    role: "super_admin",
    status: 1
  },
  { id: "2", email: "user@example.com", username: "测试用户", password: "User@1234", role: "user", status: 1 },
  { id: "3", email: "disabled@test.com", username: "已禁用", password: "Disabled1", role: "user", status: 0 }
];

const codeStore = new Map<string, { code: string; type: string }>();

// ─── 安全解包 body ────────────────────────────────────────────

function getBody(req: unknown): Record<string, unknown> {
  return (
    (req && typeof req === "object" && "body" in (req as Record<string, unknown>)
      ? ((req as Record<string, unknown>).body as Record<string, unknown>)
      : {}) || {}
  );
}

function getStr(obj: Record<string, unknown>, key: string, fallback = ""): string {
  const v = obj[key];
  return typeof v === "string" ? v : fallback;
}

log("auth 模块已加载", `(${users.length} 个 Mock 用户)`);

export const authMocks: MockMethod[] = [
  // ════════════════════════════════════════════════════════════
  // GET /api/auth/status
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/auth/status",
    method: "get",
    response: () => {
      log("GET /api/auth/status");
      return ok({
        initialized: true,
        registrationEnabled: true,
        registrationMode: "email_verify" as const,
        smtpConfigured: true
      });
    }
  },

  // ════════════════════════════════════════════════════════════
  // POST /api/auth/login
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/auth/login",
    method: "post",
    response: (req: unknown) => {
      const body = getBody(req);
      const email = getStr(body, "email");
      const password = getStr(body, "password");
      log("POST /api/auth/login", { email, password: password ? "***" : "(empty)" });

      if (!email || !password) return fail(400, "邮箱和密码不能为空");

      const user = users.find(u => u.email === email);
      if (!user) return fail(401, "邮箱或密码错误");

      if (user.password !== password) {
        const failCount = 1;
        const remain = Math.max(0, 5 - failCount);
        return { data: { remainAttempts: remain }, code: 401, msg: "邮箱或密码错误" };
      }

      if (user.status === 0) return fail(1006, "账户已被禁用，请联系管理员");

      const resp = {
        token: uid(),
        tokenType: "Bearer",
        expiresIn: 3600,
        refreshToken: uid(),
        refreshExpiresIn: 604800,
        user: { id: user.id, email: user.email, username: user.username, role: user.role }
      };
      return ok(resp, "登录成功");
    }
  },

  // ════════════════════════════════════════════════════════════
  // POST /api/auth/send-code
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/auth/send-code",
    method: "post",
    response: (req: unknown) => {
      const body = getBody(req);
      const email = getStr(body, "email");
      const type = getStr(body, "type");
      log("POST /api/auth/send-code", { email, type });

      if (!email || !type) return fail(400, "邮箱和验证码类型不能为空");
      if (!["register", "reset_password"].includes(type)) return fail(400, "无效的验证码类型");

      if (type === "register" && users.some(u => u.email === email)) return fail(1001, "该邮箱已被注册");

      codeStore.set(email, { code: "123456", type });
      log("验证码已生成", { email, code: "123456", type });
      return ok({ expireSeconds: 300 }, "验证码已发送");
    }
  },

  // ════════════════════════════════════════════════════════════
  // POST /api/auth/register（初始化注册 — 首个超管）
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/auth/register",
    method: "post",
    response: (req: unknown) => {
      const body = getBody(req);
      const email = getStr(body, "email");
      const password = getStr(body, "password");
      const username = getStr(body, "username");
      log("POST /api/auth/register", { email, hasPassword: !!password, username: username || "(default)" });

      if (!email || !password) return fail(400, "邮箱和密码不能为空");
      if (users.some(u => u.role === "super_admin")) return fail(403, "系统已初始化，请使用邮箱验证注册");
      if (users.some(u => u.email === email)) return fail(1001, "该邮箱已被注册");

      const newUser: MockUser = {
        id: String(users.length + 1),
        email,
        username: username || email.split("@")[0]!,
        role: "super_admin",
        password,
        status: 1
      };
      users.push(newUser);

      const resp = {
        token: uid(),
        tokenType: "Bearer",
        expiresIn: 3600,
        refreshToken: uid(),
        refreshExpiresIn: 604800,
        user: { id: newUser.id, email: newUser.email, username: newUser.username, role: newUser.role },
        isFirstUser: true
      };
      return ok(resp, "注册成功");
    }
  },

  // ════════════════════════════════════════════════════════════
  // POST /api/auth/verify-register（邮箱验证注册）
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/auth/verify-register",
    method: "post",
    response: (req: unknown) => {
      const body = getBody(req);
      const email = getStr(body, "email");
      const code = getStr(body, "code");
      const password = getStr(body, "password");
      const username = getStr(body, "username");
      log("POST /api/auth/verify-register", { email, code, hasPassword: !!password });

      if (!email || !code || !password) return fail(400, "邮箱、验证码和密码不能为空");

      const stored = codeStore.get(email);
      if (!stored) return fail(1004, "验证码已过期，请重新获取");
      if (stored.type !== "register" || stored.code !== code) return fail(1003, "验证码错误");
      codeStore.delete(email);

      if (users.some(u => u.email === email)) return fail(1001, "该邮箱已被注册");

      const newUser: MockUser = {
        id: String(users.length + 1),
        email,
        username: username || email.split("@")[0]!,
        role: "user",
        password,
        status: 1
      };
      users.push(newUser);

      const resp = {
        token: uid(),
        tokenType: "Bearer",
        expiresIn: 3600,
        refreshToken: uid(),
        refreshExpiresIn: 604800,
        user: { id: newUser.id, email: newUser.email, username: newUser.username, role: newUser.role }
      };
      return ok(resp, "注册成功");
    }
  },

  // ════════════════════════════════════════════════════════════
  // POST /api/auth/refresh
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/auth/refresh",
    method: "post",
    response: (req: unknown) => {
      const body = getBody(req);
      const token = getStr(body, "refreshToken");
      log("POST /api/auth/refresh", { hasToken: !!token });

      if (!token) return fail(400, "Refresh Token 不能为空");

      const u = users[0]!;
      const resp = {
        token: uid(),
        tokenType: "Bearer",
        expiresIn: 3600,
        refreshToken: uid(),
        refreshExpiresIn: 604800,
        user: { id: u.id, email: u.email, username: u.username, role: u.role }
      };
      return ok(resp, "Token 刷新成功");
    }
  },

  // ════════════════════════════════════════════════════════════
  // POST /api/auth/reset-password
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/auth/reset-password",
    method: "post",
    response: (req: unknown) => {
      const body = getBody(req);
      const email = getStr(body, "email");
      const code = getStr(body, "code");
      const pwd = getStr(body, "newPassword");
      log("POST /api/auth/reset-password", { email, code });

      if (!email || !code || !pwd) return fail(400, "邮箱、验证码和新密码不能为空");

      const stored = codeStore.get(email);
      if (!stored) return fail(1004, "验证码已过期，请重新获取");
      if (stored.type !== "reset_password" || stored.code !== code) return fail(1003, "验证码错误");
      codeStore.delete(email);

      const user = users.find(u => u.email === email);
      if (user) user.password = pwd;
      return ok(null, "密码重置成功");
    }
  },

  // ════════════════════════════════════════════════════════════
  // POST /api/auth/logout
  // ════════════════════════════════════════════════════════════
  {
    url: "/api/auth/logout",
    method: "post",
    response: (req: unknown) => {
      const h =
        (req && typeof req === "object" && "headers" in (req as Record<string, unknown>)
          ? ((req as Record<string, unknown>).headers as Record<string, unknown>)
          : {}) || {};
      log("POST /api/auth/logout", { hasAuth: !!(h.authorization || h.Authorization) });
      return ok(null, "已退出登录");
    }
  }
];
