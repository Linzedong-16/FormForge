import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initPermission,
  checkPermission,
  setPermissionCode,
  getPermissionCode,
  setPermission,
  getEnabledPermissions,
  onPermissionChange,
  registerPermission,
  mergePermissionCodes,
  intersectPermissionCodes,
  diffPermissionCodes,
  BitPermission
} from './permission';

// Mock localStorage for Node.js environment
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: (key: string) => localStorageMock.store[key] || null,
  setItem: (key: string, value: string) => { localStorageMock.store[key] = value; },
  removeItem: (key: string) => { delete localStorageMock.store[key]; },
  clear: () => { localStorageMock.store = {}; }
};

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true
});

describe('BitPermission', () => {
  const permissions = [
    { id: 'user:view', name: '查看用户', bit: 0 },
    { id: 'user:create', name: '创建用户', bit: 1 },
    { id: 'user:edit', name: '编辑用户', bit: 2 },
    { id: 'user:delete', name: '删除用户', bit: 3 },
    { id: 'system:manage', name: '系统管理', bit: 8 },
    { id: 'system:config', name: '系统配置', bit: 9, parentId: 'system:manage' }
  ];

  beforeEach(() => {
    localStorageMock.store = {};
    // 获取新实例进行测试
    (BitPermission as any).instance = null;
    initPermission(permissions, { enableInheritance: true });
    setPermissionCode(0n);
  });

  afterEach(() => {
    localStorageMock.store = {};
    (BitPermission as any).instance = null;
  });

  describe('初始化', () => {
    it('应该正确初始化权限配置', () => {
      expect(getEnabledPermissions()).toEqual([]);
    });

    it('应该验证权限位范围', () => {
      const invalidPermissions = [...permissions, { id: 'test', name: 'test', bit: 64 }];
      expect(() => initPermission(invalidPermissions)).toThrow();
    });

    it('应该验证权限位唯一性', () => {
      const duplicatePermissions = [
        { id: 'a', name: 'a', bit: 0 },
        { id: 'b', name: 'b', bit: 0 }
      ];
      expect(() => initPermission(duplicatePermissions)).toThrow();
    });
  });

  describe('权限检查', () => {
    it('应该正确检查单个权限', () => {
      setPermissionCode(1n); // 0001
      expect(checkPermission('user:view')).toBe(true);
      expect(checkPermission('user:create')).toBe(false);
    });

    it('应该正确检查多个权限（全部满足）', () => {
      setPermissionCode(3n); // 0011
      expect(checkPermission('user:view')).toBe(true);
      expect(checkPermission('user:create')).toBe(true);
    });

    it('应该正确检查禁用的权限', () => {
      setPermissionCode(1n);
      expect(checkPermission('user:view')).toBe(true);
    });
  });

  describe('权限设置', () => {
    it('应该正确设置单个权限', () => {
      setPermission('user:view', true);
      expect(checkPermission('user:view')).toBe(true);
      expect(getPermissionCode()).toBe(1n);
    });

    it('应该正确取消权限', () => {
      setPermissionCode(3n); // 0011
      setPermission('user:view', false);
      expect(checkPermission('user:view')).toBe(false);
      expect(checkPermission('user:create')).toBe(true);
      expect(getPermissionCode()).toBe(2n); // 0010
    });

    it('应该正确设置权限码', () => {
      setPermissionCode('5'); // 字符串形式
      expect(getPermissionCode()).toBe(5n); // 0101
      expect(checkPermission('user:view')).toBe(true);
      expect(checkPermission('user:create')).toBe(false);
      expect(checkPermission('user:edit')).toBe(true);
    });
  });

  describe('权限继承', () => {
    it('应该继承父权限', () => {
      setPermission('system:manage', true);
      expect(checkPermission('system:manage')).toBe(true);
      // 继承的权限需要通过 getEnabledPermissions 检查
      const enabled = getEnabledPermissions();
      expect(enabled).toContain('system:manage');
      expect(enabled).toContain('system:config');
    });

    it('子权限不影响父权限', () => {
      setPermission('system:config', true);
      expect(checkPermission('system:manage')).toBe(false);
      expect(checkPermission('system:config')).toBe(true);
    });
  });

  describe('权限码操作', () => {
    it('应该正确合并权限码', () => {
      const code1 = 1n; // 0001
      const code2 = 2n; // 0010
      expect(mergePermissionCodes(code1, code2)).toBe(3n); // 0011
    });

    it('应该正确计算交集', () => {
      const code1 = 3n; // 0011
      const code2 = 1n; // 0001
      expect(intersectPermissionCodes(code1, code2)).toBe(1n);
    });

    it('应该正确计算差集', () => {
      const code1 = 3n; // 0011
      const code2 = 1n; // 0001
      expect(diffPermissionCodes(code1, code2)).toBe(2n); // 0010
    });
  });

  describe('动态注册', () => {
    it('应该正确注册新权限', () => {
      const newPermission = { id: 'new:perm', name: '新权限', bit: 10 };
      expect(registerPermission(newPermission)).toBe(true);
      expect(checkPermission('new:perm')).toBe(false);
    });

    it('应该拒绝重复ID', () => {
      const duplicateId = { id: 'user:view', name: '重复', bit: 10 };
      expect(registerPermission(duplicateId)).toBe(false);
    });

    it('应该拒绝重复权限位', () => {
      const duplicateBit = { id: 'new:perm', name: '重复位', bit: 0 };
      expect(registerPermission(duplicateBit)).toBe(false);
    });
  });

  describe('事件机制', () => {
    it('应该触发权限变更事件', () => {
      const callback = vi.fn();
      const unsubscribe = onPermissionChange(callback);

      setPermission('user:view', true);
      expect(callback).toHaveBeenCalledWith(1n);

      unsubscribe();
      setPermission('user:create', true);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('获取启用权限列表', () => {
    it('应该返回正确的启用权限列表', () => {
      setPermissionCode(3n); // 0011
      const enabled = getEnabledPermissions();
      expect(enabled).toContain('user:view');
      expect(enabled).toContain('user:create');
      expect(enabled).not.toContain('user:edit');
    });

    it('应该包含继承的权限', () => {
      setPermission('system:manage', true);
      const enabled = getEnabledPermissions();
      expect(enabled).toContain('system:manage');
      expect(enabled).toContain('system:config');
    });
  });
});
