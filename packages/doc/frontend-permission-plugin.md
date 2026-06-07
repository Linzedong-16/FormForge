# 前端权限控制插件技术方案

## 1. 概述

### 1.1 背景

在后台管理系统中，权限控制是核心功能之一。传统的权限管理方案存在以下问题：

| 问题         | 描述                                  |
| ------------ | ------------------------------------- |
| 权限粒度粗   | 多基于页面/路由级别，难以控制到按钮级 |
| 数据传输量大 | 权限列表传输开销大                    |
| 存储成本高   | 权限数据占用较多数据库空间            |
| 扩展性差     | 新增权限需要修改大量代码              |

### 1.2 解决方案

本方案采用**二进制位运算**实现权限编码，将权限信息压缩为单个数字（number/bigint），实现：

- **精细化控制**：支持最小组件级别的权限控制
- **数据压缩**：权限数据压缩率可达 90% 以上
- **高效传输**：单个数字即可传递完整权限信息
- **易于扩展**：通过位运算支持权限动态扩展

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PermissionPlugin                             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                     权限配置层                                │   │
│  │  PermissionConfig { id, name, bit, parentId, description }   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                     │
│                              ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                     核心算法层                                │   │
│  │  • 位运算编码/解码                                           │   │
│  │  • 权限验证                                                  │   │
│  │  • 权限合并/拆分                                             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                     │
│                              ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                     API接口层                                 │   │
│  │  • checkPermission()                                        │   │
│  │  • setPermission()                                          │   │
│  │  • getPermission()                                          │   │
│  │  • onPermissionChange()                                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                     │
│                              ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                     UI绑定层                                 │   │
│  │  • v-permission 指令                                        │   │
│  │  • PermissionGuard 组件                                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 权限位分配策略

| 权限层级 | 位范围       | 说明                     |
| -------- | ------------ | ------------------------ |
| 系统级   | 0-7 (8位)    | 系统管理、配置等顶层权限 |
| 模块级   | 8-23 (16位)  | 各业务模块权限           |
| 操作级   | 24-47 (24位) | 具体操作权限（增删改查） |
| 自定义   | 48-63 (16位) | 预留扩展位               |

### 2.3 数据结构设计

```typescript
/**
 * 权限配置项
 */
export interface PermissionConfig {
  /** 权限唯一标识 */
  id: string;
  /** 权限名称 */
  name: string;
  /** 权限位位置（0-63） */
  bit: number;
  /** 父级权限ID（用于层级关系） */
  parentId?: string;
  /** 权限描述 */
  description?: string;
  /** 是否启用 */
  enabled?: boolean;
}

/**
 * 权限状态
 */
export interface PermissionState {
  /** 当前权限码 */
  code: bigint;
  /** 最后更新时间 */
  updatedAt: number;
  /** 权限配置版本 */
  version: string;
}
```

---

## 3. 核心算法

### 3.1 位运算基础

| 操作     | 运算                          | 说明                |
| -------- | ----------------------------- | ------------------- | -------------- |
| 设置权限 | `code                         | (1n << bit)`        | 将指定位设为1  |
| 取消权限 | `code & ~(1n << bit)`         | 将指定位设为0       |
| 检查权限 | `(code & (1n << bit)) !== 0n` | 检查指定位是否为1   |
| 权限合并 | `code1                        | code2`              | 合并两个权限码 |
| 权限交集 | `code1 & code2`               | 获取共同权限        |
| 权限差集 | `code1 & ~code2`              | 获取code1独有的权限 |

### 3.2 权限码生成算法

```typescript
/**
 * 根据权限配置生成权限码
 * @param configs 权限配置列表
 * @param enabledIds 启用的权限ID列表
 * @returns 权限码（bigint）
 */
function generatePermissionCode(configs: PermissionConfig[], enabledIds: string[]): bigint {
  let code = 0n;
  for (const config of configs) {
    if (enabledIds.includes(config.id) && config.enabled !== false) {
      code |= 1n << BigInt(config.bit);
    }
  }
  return code;
}
```

### 3.3 权限码解码算法

```typescript
/**
 * 将权限码解码为权限ID列表
 * @param code 权限码
 * @param configs 权限配置列表
 * @returns 启用的权限ID列表
 */
function decodePermissionCode(code: bigint, configs: PermissionConfig[]): string[] {
  const enabledIds: string[] = [];
  for (const config of configs) {
    const bitMask = 1n << BigInt(config.bit);
    if ((code & bitMask) !== 0n) {
      enabledIds.push(config.id);
    }
  }
  return enabledIds;
}
```

### 3.4 权限层级继承算法

```typescript
/**
 * 处理权限层级继承
 * 父权限启用时，自动启用所有子权限
 * @param configs 权限配置列表
 * @param enabledIds 原始启用权限ID
 * @returns 包含继承的完整权限ID列表
 */
function resolvePermissionInheritance(configs: PermissionConfig[], enabledIds: string[]): string[] {
  const result = new Set(enabledIds);
  const configMap = new Map(configs.map(c => [c.id, c]));

  // 构建父->子映射
  const parentChildrenMap = new Map<string, PermissionConfig[]>();
  for (const config of configs) {
    if (config.parentId) {
      const children = parentChildrenMap.get(config.parentId) || [];
      children.push(config);
      parentChildrenMap.set(config.parentId, children);
    }
  }

  // 递归继承
  function inherit(parentId: string): void {
    const children = parentChildrenMap.get(parentId) || [];
    for (const child of children) {
      if (!result.has(child.id)) {
        result.add(child.id);
        inherit(child.id);
      }
    }
  }

  // 对所有已启用的权限执行继承
  for (const id of enabledIds) {
    inherit(id);
  }

  return Array.from(result);
}
```

---

## 4. API 设计

### 4.1 初始化接口

```typescript
/**
 * 初始化权限插件
 * @param configs 权限配置列表
 * @param options 配置选项
 */
interface InitOptions {
  /** 是否启用权限继承 */
  enableInheritance?: boolean;
  /** 权限码存储key（用于localStorage） */
  storageKey?: string;
  /** 权限配置版本 */
  version?: string;
}

function initPermission(configs: PermissionConfig[], options?: InitOptions): void;
```

### 4.2 权限检查接口

```typescript
/**
 * 检查单个权限
 * @param permissionId 权限ID
 * @returns 是否拥有该权限
 */
function checkPermission(permissionId: string): boolean;

/**
 * 检查多个权限（全部满足）
 * @param permissionIds 权限ID列表
 * @returns 是否拥有所有权限
 */
function checkAllPermissions(permissionIds: string[]): boolean;

/**
 * 检查多个权限（满足任一）
 * @param permissionIds 权限ID列表
 * @returns 是否拥有任一权限
 */
function checkAnyPermission(permissionIds: string[]): boolean;
```

### 4.3 权限管理接口

```typescript
/**
 * 获取当前权限码
 * @returns 当前权限码（bigint）
 */
function getPermissionCode(): bigint;

/**
 * 设置权限码
 * @param code 权限码
 */
function setPermissionCode(code: bigint | number | string): void;

/**
 * 设置单个权限状态
 * @param permissionId 权限ID
 * @param enabled 是否启用
 */
function setPermission(permissionId: string, enabled: boolean): void;

/**
 * 批量设置权限
 * @param permissionIds 权限ID列表
 * @param enabled 是否启用
 */
function setPermissions(permissionIds: string[], enabled: boolean): void;

/**
 * 重置权限码为0
 */
function resetPermissions(): void;
```

### 4.4 事件机制

```typescript
/**
 * 订阅权限变更事件
 * @param callback 回调函数，接收新权限码
 * @returns 取消订阅函数
 */
function onPermissionChange(callback: (code: bigint) => void): () => void;

/**
 * 触发权限变更事件（内部使用）
 */
function emitPermissionChange(): void;
```

### 4.5 工具方法

```typescript
/**
 * 获取权限配置列表
 * @returns 权限配置列表
 */
function getPermissionConfigs(): PermissionConfig[];

/**
 * 根据ID获取权限配置
 * @param permissionId 权限ID
 * @returns 权限配置
 */
function getPermissionConfig(permissionId: string): PermissionConfig | undefined;

/**
 * 获取当前启用的权限ID列表
 * @returns 启用的权限ID列表
 */
function getEnabledPermissions(): string[];

/**
 * 权限码转换为字符串（用于传输）
 * @param code 权限码
 * @returns 字符串表示
 */
function codeToString(code: bigint): string;

/**
 * 字符串转换为权限码
 * @param str 字符串表示
 * @returns 权限码
 */
function stringToCode(str: string): bigint;
```

---

## 5. UI 绑定机制

### 5.1 Vue 指令

```typescript
/**
 * v-permission 指令
 * 控制元素显示/隐藏
 */
// 使用方式
// <button v-permission="'user:create'">创建用户</button>
// <button v-permission:disabled="'user:edit'">编辑用户</button>

interface PermissionDirectiveOptions {
  arg?: "disabled" | "readonly"; // 控制方式
  modifiers?: {
    any?: boolean; // 满足任一即可
  };
}
```

### 5.2 权限守卫组件

```typescript
/**
 * PermissionGuard 组件
 * 控制组件渲染
 */
// 使用方式
// <PermissionGuard permission="user:delete">
//   <button>删除用户</button>
// </PermissionGuard>

interface PermissionGuardProps {
  /** 需要的权限ID */
  permission: string | string[];
  /** 是否满足任一即可 */
  any?: boolean;
  /** 无权限时显示的内容 */
  fallback?: string | VNode;
}
```

---

## 6. 与后端交互方案

### 6.1 数据传输格式

| 场景     | 数据类型 | 说明                    |
| -------- | -------- | ----------------------- |
| 请求参数 | `string` | 权限码转为十进制字符串  |
| 响应数据 | `string` | 后端返回十进制字符串    |
| 本地存储 | `string` | localStorage 存储字符串 |

### 6.2 后端接口设计

```typescript
/**
 * 获取当前用户权限
 * GET /api/auth/permissions
 */
interface GetPermissionsResponse {
  code: string; // 权限码（十进制字符串）
  version: string; // 权限配置版本
  updatedAt: string; // 更新时间
}

/**
 * 批量更新权限（管理员）
 * PUT /api/admin/permissions/{userId}
 */
interface UpdatePermissionsRequest {
  code: string; // 权限码（十进制字符串）
}
```

### 6.3 数据转换流程

```
后端 → 前端：
  string (十进制) → BigInt() → 内部使用

前端 → 后端：
  bigint → toString() → string (十进制)
```

---

## 7. 安全性考虑

### 7.1 权限验证

- **前端验证**：用于UI控制，但不能替代后端验证
- **后端验证**：必须在API层面再次验证权限
- **双重验证**：前后端协同确保安全性

### 7.2 权限码保护

```typescript
/**
 * 权限码签名机制（可选）
 * 使用JWT携带权限码，防止篡改
 */
interface JwtPayload {
  sub: string; // 用户ID
  perms: string; // 权限码
  exp: number; // 过期时间
  iat: number; // 签发时间
}
```

---

## 8. 扩展机制

### 8.1 动态权限注册

```typescript
/**
 * 动态注册新权限
 * @param config 权限配置
 * @returns 是否注册成功
 */
function registerPermission(config: PermissionConfig): boolean;

/**
 * 批量注册权限
 * @param configs 权限配置列表
 */
function registerPermissions(configs: PermissionConfig[]): void;
```

### 8.2 权限位分配策略

| 策略     | 说明               | 适用场景           |
| -------- | ------------------ | ------------------ |
| 顺序分配 | 从0开始依次分配    | 权限固定的系统     |
| 层级分配 | 按模块分组分配位段 | 模块清晰的系统     |
| 动态分配 | 运行时自动分配     | 权限频繁变动的系统 |

---

## 9. 使用示例

### 9.1 基础使用

```typescript
import { initPermission, checkPermission, setPermissionCode } from "@/plugins/permission";

// 1. 初始化权限配置
const permissions = [
  { id: "system:manage", name: "系统管理", bit: 0 },
  { id: "user:view", name: "查看用户", bit: 1 },
  { id: "user:create", name: "创建用户", bit: 2 },
  { id: "user:edit", name: "编辑用户", bit: 3 },
  { id: "user:delete", name: "删除用户", bit: 4 }
];

initPermission(permissions);

// 2. 从后端获取权限码并设置
const userPermissions = await fetch("/api/auth/permissions");
setPermissionCode(userPermissions.code);

// 3. 检查权限
if (checkPermission("user:create")) {
  console.log("有权限创建用户");
}
```

### 9.2 Vue 组件中使用

```vue
<template>
  <div>
    <!-- 按钮级权限控制 -->
    <el-button v-permission="'user:create'" type="primary" @click="handleCreate"> 创建用户 </el-button>

    <!-- 禁用模式 -->
    <el-button v-permission:disabled="'user:edit'" @click="handleEdit"> 编辑用户 </el-button>

    <!-- 权限守卫组件 -->
    <PermissionGuard permission="user:delete" fallback="无删除权限">
      <el-button type="danger" @click="handleDelete"> 删除用户 </el-button>
    </PermissionGuard>
  </div>
</template>

<script setup>
import { PermissionGuard } from "@/plugins/permission";

const handleCreate = () => console.log("创建用户");
const handleEdit = () => console.log("编辑用户");
const handleDelete = () => console.log("删除用户");
</script>
```

### 9.3 路由守卫

```typescript
import { checkPermission } from '@/plugins/permission';
import router from './router';

router.beforeEach((to, from, next) => {
  const requiredPermission = to.meta.permission;

  if (requiredPermission) {
    if (checkPermission(requiredPermission)) {
      next();
    } else {
      next('/403'); // 无权限页面
    }
  } else {
    next();
  }
});

// 路由配置
{
  path: '/admin/users',
  name: 'UserManagement',
  component: UserManagement,
  meta: { permission: 'system:manage' }
}
```

---

## 10. 性能优化

### 10.1 权限码压缩

| 权限数量 | 传统方式(JSON) | 位运算方式(bigint) | 压缩率 |
| -------- | -------------- | ------------------ | ------ |
| 8        | ~200 bytes     | 1 byte             | 99.5%  |
| 16       | ~400 bytes     | 2 bytes            | 99.5%  |
| 32       | ~800 bytes     | 4 bytes            | 99.5%  |
| 64       | ~1.6 KB        | 8 bytes            | 99.5%  |

### 10.2 缓存策略

```typescript
/**
 * 权限检查结果缓存
 * 避免重复计算
 */
const permissionCache = new Map<string, boolean>();

function checkPermission(permissionId: string): boolean {
  // 优先从缓存获取
  if (permissionCache.has(permissionId)) {
    return permissionCache.get(permissionId)!;
  }

  // 计算并缓存
  const config = getPermissionConfig(permissionId);
  const result = config ? (currentCode & (1n << BigInt(config.bit))) !== 0n : false;
  permissionCache.set(permissionId, result);

  return result;
}

// 权限变更时清空缓存
function onPermissionChange() {
  permissionCache.clear();
  // ...
}
```

---

## 11. 兼容性说明

### 11.1 浏览器兼容性

| 特性   | IE  | Chrome | Firefox | Safari |
| ------ | --- | ------ | ------- | ------ |
| BigInt | ❌  | ✅ 67+ | ✅ 68+  | ✅ 14+ |
| 位运算 | ✅  | ✅     | ✅      | ✅     |

### 11.2 降级方案

```typescript
/**
 * 当不支持BigInt时使用字符串存储
 */
class PermissionStorage {
  private useStringFallback: boolean;

  constructor() {
    this.useStringFallback = typeof BigInt !== "function";
  }

  setCode(code: bigint | string): void {
    if (this.useStringFallback) {
      localStorage.setItem("permission_code", String(code));
    } else {
      localStorage.setItem("permission_code", code.toString());
    }
  }

  getCode(): bigint {
    const stored = localStorage.getItem("permission_code");
    return this.useStringFallback ? BigInt(stored || "0") : BigInt(stored || "0");
  }
}
```

---

## 12. 最佳实践

### 12.1 权限设计原则

1. **最小权限原则**：只分配必要的权限
2. **层级清晰**：建立合理的权限层级关系
3. **易于管理**：权限命名规范统一
4. **可审计**：记录权限变更日志

### 12.2 权限命名规范

```typescript
// 格式: module:action[:resource]
{
  id: 'system:manage',        // 系统管理
  id: 'user:view',            // 查看用户
  id: 'user:create',          // 创建用户
  id: 'questionnaire:edit',   // 编辑问卷
}
```

### 12.3 性能建议

1. **权限配置预加载**：应用启动时一次性加载所有权限配置
2. **缓存检查结果**：避免重复位运算
3. **懒加载验证**：只在需要时进行权限检查
4. **批量操作优化**：批量设置权限时减少事件触发次数

---

## 13. 总结

本方案通过二进制位运算实现了精细化的前端权限控制，核心优势包括：

| 优势         | 说明                         |
| ------------ | ---------------------------- |
| **高性能**   | 位运算效率极高，毫秒级响应   |
| **高压缩率** | 权限数据压缩率达 99% 以上    |
| **易扩展**   | 支持动态权限注册和位扩展     |
| **跨框架**   | 不依赖特定前端框架，通用性强 |
| **安全性**   | 权限码不可篡改，支持签名验证 |

该方案适用于各种规模的后台管理系统，从小型应用到大型企业级系统都能良好运行。
