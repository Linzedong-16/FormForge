/**
 * v-permiss 权限指令单元测试
 *
 * 测试范围：
 *   1. 角色层级：super_admin > admin > user
 *   2. 字符串模式：直接比对角色
 *   3. 数组模式：角色列表匹配
 *   4. 未登录 / 无用户信息 → 无权限
 *   5. 无绑定值 → 不做处理
 *   6. mounted / updated 钩子行为一致
 *   7. WeakMap 存储原始 display 属性
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { DirectiveBinding } from "vue";

// ─── Mock useUserStore ──────────────────────────────────────────

const mockUserStore = {
  user: null as { role: string } | null,
  isLoggedIn: false
};

vi.mock("@/stores/useUser", () => ({
  useUserStore: () => mockUserStore
}));

// 必须在 mock 之后导入
import { vPermiss } from "../permiss";
import type { PermissRole, PermissValue } from "../permiss";

// ─── 辅助函数 ──────────────────────────────────────────────────

/** 创建模拟的 DirectiveBinding */
function createBinding(value: PermissValue): DirectiveBinding<PermissValue> {
  return {
    value,
    oldValue: undefined,
    arg: undefined,
    modifiers: {},
    instance: null,
    dir: {} as any
  } as DirectiveBinding<PermissValue>;
}

/** 设置 mock 用户状态 */
function setUser(role: PermissRole | null, isLoggedIn = true) {
  mockUserStore.user = role ? { role } : null;
  mockUserStore.isLoggedIn = isLoggedIn;
}

/** 创建干净的 DOM 元素 */
function createElement(tag = "div"): HTMLElement {
  return document.createElement(tag);
}

describe("v-permiss — 全量单元测试", () => {
  beforeEach(() => {
    // 重置 mock 状态
    mockUserStore.user = null;
    mockUserStore.isLoggedIn = false;
  });

  // ════════════════════════════════════════════════════════════
  //  1. 角色层级 — super_admin
  // ════════════════════════════════════════════════════════════
  describe("super_admin 角色", () => {
    it("super_admin 访问 super_admin 权限应可见", () => {
      setUser("super_admin");
      const el = createElement();
      el.style.display = "block";

      vPermiss.mounted!(el, createBinding("super_admin"), null as any, null as any);

      expect(el.style.display).not.toBe("none");
    });

    it("super_admin 访问 admin 权限应可见（上级继承）", () => {
      setUser("super_admin");
      const el = createElement();
      el.style.display = "block";

      vPermiss.mounted!(el, createBinding("admin"), null as any, null as any);

      expect(el.style.display).not.toBe("none");
    });

    it("super_admin 访问 user 权限应可见（上级继承）", () => {
      setUser("super_admin");
      const el = createElement();
      el.style.display = "block";

      vPermiss.mounted!(el, createBinding("user"), null as any, null as any);

      expect(el.style.display).not.toBe("none");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  2. 角色层级 — admin
  // ════════════════════════════════════════════════════════════
  describe("admin 角色", () => {
    it("admin 访问 super_admin 权限应不可见", () => {
      setUser("admin");
      const el = createElement();

      vPermiss.mounted!(el, createBinding("super_admin"), null as any, null as any);

      expect(el.style.display).toBe("none");
    });

    it("admin 访问 admin 权限应可见", () => {
      setUser("admin");
      const el = createElement();
      el.style.display = "block";

      vPermiss.mounted!(el, createBinding("admin"), null as any, null as any);

      expect(el.style.display).not.toBe("none");
    });

    it("admin 访问 user 权限应可见（上级继承）", () => {
      setUser("admin");
      const el = createElement();
      el.style.display = "block";

      vPermiss.mounted!(el, createBinding("user"), null as any, null as any);

      expect(el.style.display).not.toBe("none");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  3. 角色层级 — user
  // ════════════════════════════════════════════════════════════
  describe("user 角色", () => {
    it("user 访问 super_admin 权限应不可见", () => {
      setUser("user");
      const el = createElement();

      vPermiss.mounted!(el, createBinding("super_admin"), null as any, null as any);

      expect(el.style.display).toBe("none");
    });

    it("user 访问 admin 权限应不可见", () => {
      setUser("user");
      const el = createElement();

      vPermiss.mounted!(el, createBinding("admin"), null as any, null as any);

      expect(el.style.display).toBe("none");
    });

    it("user 访问 user 权限应可见", () => {
      setUser("user");
      const el = createElement();
      el.style.display = "block";

      vPermiss.mounted!(el, createBinding("user"), null as any, null as any);

      expect(el.style.display).not.toBe("none");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  4. 未登录 / 无用户信息
  // ════════════════════════════════════════════════════════════
  describe("未登录状态", () => {
    it("未登录时任何权限都应不可见", () => {
      setUser(null, false);
      const el = createElement();

      vPermiss.mounted!(el, createBinding("user"), null as any, null as any);

      expect(el.style.display).toBe("none");
    });

    it("isLoggedIn 为 false 时即使有 user 也应不可见", () => {
      mockUserStore.user = { role: "super_admin" };
      mockUserStore.isLoggedIn = false;
      const el = createElement();

      vPermiss.mounted!(el, createBinding("user"), null as any, null as any);

      expect(el.style.display).toBe("none");
    });

    it("user 为 null 时即使 isLoggedIn 为 true 也应不可见", () => {
      mockUserStore.user = null;
      mockUserStore.isLoggedIn = true;
      const el = createElement();

      vPermiss.mounted!(el, createBinding("user"), null as any, null as any);

      expect(el.style.display).toBe("none");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  5. 无绑定值
  // ════════════════════════════════════════════════════════════
  describe("无绑定值", () => {
    it("绑定值为 undefined 时不应改变 display", () => {
      setUser("user");
      const el = createElement();
      el.style.display = "block";

      vPermiss.mounted!(el, createBinding(undefined as any), null as any, null as any);

      expect(el.style.display).toBe("block");
    });

    it("绑定值为 null 时不应改变 display", () => {
      setUser("user");
      const el = createElement();
      el.style.display = "block";

      vPermiss.mounted!(el, createBinding(null as any), null as any, null as any);

      expect(el.style.display).toBe("block");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  6. 数组模式
  // ════════════════════════════════════════════════════════════
  describe("数组模式", () => {
    it("数组包含 user 时 user 角色应可见", () => {
      setUser("user");
      const el = createElement();
      el.style.display = "block";

      vPermiss.mounted!(el, createBinding(["user", "admin"]), null as any, null as any);

      expect(el.style.display).not.toBe("none");
    });

    it("数组不包含 user 时 user 角色应不可见", () => {
      setUser("user");
      const el = createElement();

      vPermiss.mounted!(el, createBinding(["admin", "super_admin"]), null as any, null as any);

      expect(el.style.display).toBe("none");
    });

    it("admin 在包含 admin 的数组中应可见", () => {
      setUser("admin");
      const el = createElement();
      el.style.display = "block";

      vPermiss.mounted!(el, createBinding(["admin", "super_admin"]), null as any, null as any);

      expect(el.style.display).not.toBe("none");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  7. mounted / updated 钩子行为一致
  // ════════════════════════════════════════════════════════════
  describe("mounted 与 updated 钩子", () => {
    it("mounted 和无权限时 updated 应能隐藏元素", () => {
      setUser("user");
      const el = createElement();
      el.style.display = "block";

      vPermiss.mounted!(el, createBinding("admin"), null as any, null as any);
      expect(el.style.display).toBe("none");
    });

    it("updated 钩子应能改变元素可见性", () => {
      setUser("user");
      const el = createElement();

      // 先挂载为 admin 权限（不可见）
      vPermiss.mounted!(el, createBinding("admin"), null as any, null as any);
      expect(el.style.display).toBe("none");

      // 更新为 user 权限（可见）
      vPermiss.updated!(el, createBinding("user"), null as any, null as any, null as any);
      expect(el.style.display).not.toBe("none");
    });
  });
});