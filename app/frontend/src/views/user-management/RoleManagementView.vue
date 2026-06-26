<template>
  <div class="role-mgmt-page">
    <div class="page-toolbar">
      <div>
        <h3 class="page-title">角色管理</h3>
        <span class="page-subtitle">定义系统角色及其对应的权限集合，分配给用户</span>
      </div>
      <a-button type="primary" @click="handleAdd">
        <template #icon><icon-plus /></template>
        新增角色
      </a-button>
    </div>

    <a-row :gutter="16">
      <a-col v-for="role in mockRoles" :key="role.id" :span="8">
        <a-card :bordered="true" class="role-card">
          <template #title>
            <a-space>
              <a-tag :color="role.color" size="small">{{ role.name }}</a-tag>
              <span class="role-desc">{{ role.description }}</span>
            </a-space>
          </template>
          <template #extra>
            <a-link @click="handleEdit(role)">编辑</a-link>
          </template>
          <div class="role-perms">
            <a-tag v-for="perm in role.permissions" :key="perm" size="small" color="gray">{{ perm }}</a-tag>
          </div>
          <template #footer>
            <a-space>
              <span class="count-label">关联用户：</span>
              <span class="count-value">{{ role.userCount }}</span>
            </a-space>
          </template>
        </a-card>
      </a-col>
    </a-row>

    <a-empty v-if="mockRoles.length === 0" description="暂无角色数据" />
  </div>
</template>

<script setup lang="ts">
import { Message } from "@arco-design/web-vue";
import { IconPlus } from "@arco-design/web-vue/es/icon";

interface RoleItem {
  id: number;
  name: string;
  description: string;
  color: string;
  permissions: string[];
  userCount: number;
}

const mockRoles: RoleItem[] = [
  {
    id: 1,
    name: "超级管理员",
    description: "拥有系统所有权限",
    color: "red",
    permissions: ["用户管理", "问卷管理", "审核管理", "系统配置", "日志查看", "API Token"],
    userCount: 3
  },
  {
    id: 2,
    name: "管理员",
    description: "可管理问卷和用户",
    color: "arcoblue",
    permissions: ["用户管理", "问卷管理", "审核管理", "日志查看"],
    userCount: 8
  },
  {
    id: 3,
    name: "普通用户",
    description: "创建和编辑自己的问卷",
    color: "gray",
    permissions: ["问卷创建", "问卷编辑", "问卷删除", "答卷查看"],
    userCount: 186
  }
];

function handleAdd() {
  Message.info("角色创建功能开发中");
}
function handleEdit(role: RoleItem) {
  Message.info(`编辑角色「${role.name}」功能开发中`);
}
</script>

<style scoped>
.role-mgmt-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.page-title {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-1);
}
.page-subtitle {
  font-size: 13px;
  color: var(--color-text-3);
}
.role-card {
  min-height: 160px;
  background: var(--color-bg-2);
  border-color: var(--color-border-2);
}
:deep(.role-card .arco-card-header) {
  border-color: var(--color-border-2);
}
:deep(.role-card .arco-card-footer) {
  border-color: var(--color-border-2);
  background: transparent;
}
.role-desc {
  font-size: 12px;
  color: var(--color-text-3);
}
.role-perms {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.count-label {
  font-size: 12px;
  color: var(--color-text-3);
}
.count-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-1);
}
</style>
