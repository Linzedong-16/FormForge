# BitPermission - 基于二进制位运算的前端权限控制插件

## 简介

BitPermission 是一个基于二进制位运算的前端权限控制插件，实现了最小组件级别的精细化权限管理。

### 核心特性

- **高效压缩**：权限数据压缩率达 99% 以上
- **精细控制**：支持按钮级别的权限控制
- **层级继承**：支持权限层级关系和继承
- **事件驱动**：权限变更时自动通知UI更新
- **类型安全**：完整的 TypeScript 类型定义

## 安装

```bash
pnpm add @questionnaire/bit-permission
```

## 快速开始

### 1. 初始化

```typescript
import { initPermission, setPermissionCode, checkPermission } from "@questionnaire/bit-permission";

// 定义权限配置
const permissions = [
  { id: "user:view", name: "查看用户", bit: 0 },
  { id: "user:create", name: "创建用户", bit: 1 },
  { id: "user:edit", name: "编辑用户", bit: 2 },
  { id: "user:delete", name: "删除用户", bit: 3 },
  { id: "system:manage", name: "系统管理", bit: 8 },
  { id: "system:config", name: "系统配置", bit: 9, parentId: "system:manage" }
];

// 初始化权限插件
initPermission(permissions, {
  enableInheritance: true, // 启用权限继承
  storageKey: "permission_code" // localStorage key
});

// 从后端获取权限码并设置
const userCode = await fetch("/api/auth/permissions");
setPermissionCode(userCode);
```

### 2. 权限检查

```typescript
// 检查单个权限
if (checkPermission("user:create")) {
  console.log("有权限创建用户");
}

// 检查多个权限（全部满足）
if (checkAllPermissions(["user:view", "user:edit"])) {
  console.log("拥有所有指定权限");
}

// 检查多个权限（满足任一）
if (checkAnyPermissions(["user:create", "user:edit"])) {
  console.log("拥有至少一个权限");
}
```

### 3. 设置权限

```typescript
// 设置单个权限
setPermission("user:delete", true);

// 批量设置权限
setPermissions(["user:view", "user:edit"], true);

// 重置所有权限
resetPermissions();
```

### 4. 监听权限变更

```typescript
const unsubscribe = onPermissionChange(code => {
  console.log("权限码变更:", code.toString());
  // 更新UI状态
});

// 取消订阅
unsubscribe();
```

## API 文档

### 初始化

```typescript
initPermission(configs: PermissionConfig[], options?: InitOptions)
```

| 参数                        | 类型                 | 说明                |
| --------------------------- | -------------------- | ------------------- |
| `configs`                   | `PermissionConfig[]` | 权限配置列表        |
| `options.enableInheritance` | `boolean`            | 是否启用权限继承    |
| `options.storageKey`        | `string`             | localStorage 存储键 |
| `options.version`           | `string`             | 配置版本            |

### 权限检查

```typescript
checkPermission(id: string): boolean
checkAllPermissions(ids: string[]): boolean
checkAnyPermissions(ids: string[]): boolean
```

### 权限管理

```typescript
setPermissionCode(code: bigint | number | string): void
setPermission(id: string, enabled: boolean): void
setPermissions(ids: string[], enabled: boolean): void
resetPermissions(): void
```

### 事件机制

```typescript
onPermissionChange(callback: (code: bigint) => void): () => void
```

### 工具方法

```typescript
getEnabledPermissions(): string[]
getPermissionConfigs(): PermissionConfig[]
getPermissionConfig(id: string): PermissionConfig | undefined
codeToString(code: bigint): string
stringToCode(str: string): bigint
```

## 权限配置结构

```typescript
interface PermissionConfig {
  id: string; // 权限唯一标识
  name: string; // 权限名称
  bit: number; // 权限位位置（0-63）
  parentId?: string; // 父级权限ID
  description?: string; // 权限描述
  enabled?: boolean; // 是否启用
}
```

## 权限位分配策略

| 位范围 | 用途       |
| ------ | ---------- |
| 0-7    | 系统级权限 |
| 8-23   | 模块级权限 |
| 24-47  | 操作级权限 |
| 48-63  | 自定义扩展 |

## 与后端交互

```typescript
// 前端 → 后端：发送字符串格式
const codeStr = codeToString(getPermissionCode());
await fetch("/api/admin/permissions", {
  method: "PUT",
  body: JSON.stringify({ code: codeStr })
});

// 后端 → 前端：接收字符串格式
const res = await fetch("/api/auth/permissions");
setPermissionCode(res.code);
```

## Vue 集成示例

### 自定义指令

```typescript
import { checkPermission } from "@questionnaire/bit-permission";

// 注册全局指令
app.directive("permission", {
  mounted(el, binding) {
    const hasPermission = checkPermission(binding.value);
    if (!hasPermission) {
      el.style.display = "none";
    }
  }
});
```

```vue
<button v-permission="'user:create'">创建用户</button>
```

### 权限守卫组件

```vue
<script setup lang="ts">
import { checkPermission } from "@questionnaire/bit-permission";

defineProps<{
  permission: string;
}>();
</script>

<template>
  <slot v-if="checkPermission(permission)" />
</template>
```

## 最佳实践

### 权限命名规范

```typescript
// 格式: module:action[:resource]
{
  id: 'user:view',
  id: 'user:create',
  id: 'questionnaire:edit',
  id: 'system:config'
}
```

### 性能优化

1. **缓存检查结果**：插件内置缓存机制
2. **懒加载验证**：只在需要时进行权限检查
3. **批量操作**：使用 `setPermissions` 减少事件触发

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm run dev

# 构建
pnpm run build

# 测试
pnpm run test

# 代码检查
pnpm run lint
```

## 许可证

MIT
