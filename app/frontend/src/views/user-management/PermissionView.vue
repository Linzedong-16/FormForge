<template>
  <div class="perm-page">
    <div class="page-toolbar">
      <div>
        <h3 class="page-title">权限设置</h3>
        <span class="page-subtitle">管理平台各功能模块的访问控制策略</span>
      </div>
    </div>

    <a-table :data="mockPermissions" :pagination="false" :bordered="{ wrapper: true, cell: true }" row-key="module">
      <template #columns>
        <a-table-column title="功能模块" data-index="module" :width="160" />
        <a-table-column title="模块说明" data-index="description" :width="200" :ellipsis="true" />
        <a-table-column title="超级管理员" :width="120" align="center">
          <template #cell><a-tag color="green" size="small">完全访问</a-tag></template>
        </a-table-column>
        <a-table-column title="管理员" :width="120" align="center">
          <template #cell="{ record }">
            <a-tag :color="record.adminAccess ? 'green' : 'red'" size="small">
              {{ record.adminAccess ? "可访问" : "禁止" }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column title="普通用户" :width="120" align="center">
          <template #cell="{ record }">
            <a-switch :default-checked="record.userAccess" disabled size="small" />
          </template>
        </a-table-column>
      </template>
    </a-table>

    <a-alert type="info" show-icon style="margin-top: 12px"> 权限设置功能开发中，当前展示为预设权限矩阵。 </a-alert>
  </div>
</template>

<script setup lang="ts">
interface PermissionItem {
  module: string;
  description: string;
  adminAccess: boolean;
  userAccess: boolean;
}

const mockPermissions: PermissionItem[] = [
  { module: "用户管理", description: "添加、编辑、删除、封禁用户", adminAccess: true, userAccess: false },
  { module: "问卷管理", description: "查看、编辑、删除所有问卷", adminAccess: true, userAccess: false },
  { module: "审核管理", description: "审核问卷内容与模板申请", adminAccess: true, userAccess: false },
  { module: "系统配置", description: "修改平台全局配置参数", adminAccess: false, userAccess: false },
  { module: "日志查看", description: "查询操作日志与审计记录", adminAccess: true, userAccess: false },
  { module: "问卷创建", description: "创建个人问卷", adminAccess: true, userAccess: true },
  { module: "问卷编辑", description: "编辑自己的问卷", adminAccess: true, userAccess: true },
  { module: "答卷查看", description: "查看自己问卷的答卷数据", adminAccess: true, userAccess: true },
  { module: "API Token", description: "管理个人 API 访问令牌", adminAccess: true, userAccess: true }
];
</script>

<style scoped>
.perm-page {
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
</style>
