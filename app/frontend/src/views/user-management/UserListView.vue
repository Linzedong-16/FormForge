<template>
  <div class="user-list-page">
    <!-- 页面标题 + 操作 -->
    <div class="page-toolbar">
      <div>
        <h3 class="page-title">用户列表</h3>
        <span class="page-subtitle">管理系统所有注册用户，支持添加、封禁、删除等操作</span>
      </div>
      <a-space>
        <a-input-search
          v-model="searchKeyword"
          placeholder="搜索用户名/邮箱"
          style="width: 240px"
          allow-clear
          @search="handleSearch"
          @clear="handleSearch"
        />
        <a-button type="primary" @click="handleAdd">
          <template #icon><icon-plus /></template>
          添加用户
        </a-button>
      </a-space>
    </div>

    <!-- 用户表格 -->
    <a-table
      :data="filteredUsers"
      :loading="loading"
      :pagination="pagination"
      :stripe="true"
      :bordered="{ wrapper: true, cell: true }"
      column-resizable
      row-key="id"
      @page-change="handlePageChange"
    >
      <template #columns>
        <a-table-column title="ID" data-index="id" :width="70" align="center" />
        <a-table-column title="用户名" data-index="username" :width="120" />
        <a-table-column title="邮箱" data-index="email" :width="200" :ellipsis="true" />
        <a-table-column title="角色" :width="120" align="center">
          <template #cell="{ record }">
            <a-tag :color="roleColor(record.role)" size="small">{{ roleLabel(record.role) }}</a-tag>
          </template>
        </a-table-column>
        <a-table-column title="状态" :width="90" align="center">
          <template #cell="{ record }">
            <a-tag :color="record.status === 1 ? 'green' : 'red'" size="small">
              {{ record.status === 1 ? "正常" : "已封禁" }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column
          title="问卷数"
          data-index="surveyCount"
          :width="80"
          align="center"
          :sortable="{ sortDirections: ['ascend', 'descend'] }"
        />
        <a-table-column title="注册时间" data-index="createdAt" :width="170" align="center">
          <template #cell="{ record }">
            {{ formatDate(record.createdAt) }}
          </template>
        </a-table-column>
        <a-table-column title="最后登录" data-index="lastLogin" :width="170" align="center">
          <template #cell="{ record }">
            {{ formatDate(record.lastLogin) }}
          </template>
        </a-table-column>
        <a-table-column title="操作" :width="240" align="center" fixed="right">
          <template #cell="{ record }">
            <a-space :size="0">
              <a-button type="text" size="small" @click="handleEdit(record)">编辑</a-button>
              <a-button v-if="record.status === 1" type="text" size="small" status="warning" @click="handleBan(record)"
                >封禁</a-button
              >
              <a-button v-else type="text" size="small" status="success" @click="handleUnban(record)">解封</a-button>
              <a-button type="text" size="small" status="danger" @click="handleDelete(record)">删除</a-button>
            </a-space>
          </template>
        </a-table-column>
      </template>
    </a-table>

    <!-- 添加/编辑用户弹窗 -->
    <a-modal
      v-model:visible="formVisible"
      :title="editingUser ? '编辑用户' : '添加用户'"
      width="500px"
      :ok-loading="formSubmitting"
      @ok="handleFormSubmit"
      @cancel="resetForm"
    >
      <a-form :model="form" layout="vertical">
        <a-form-item label="用户名" required>
          <a-input v-model="form.username" placeholder="请输入用户名" :max-length="50" />
        </a-form-item>
        <a-form-item label="邮箱" required>
          <a-input v-model="form.email" placeholder="请输入邮箱" :max-length="100" />
        </a-form-item>
        <a-form-item v-if="!editingUser" label="密码" required>
          <a-input-password v-model="form.password" placeholder="请输入初始密码" />
        </a-form-item>
        <a-form-item label="角色">
          <a-select v-model="form.role" placeholder="请选择角色">
            <a-option value="super_admin">超级管理员</a-option>
            <a-option value="admin">管理员</a-option>
            <a-option value="user">普通用户</a-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Message, Modal } from "@arco-design/web-vue";
import { IconPlus } from "@arco-design/web-vue/es/icon";

// ─── 类型 ──────────────────────────────────────────────────────
interface UserItem {
  id: number;
  username: string;
  email: string;
  role: string;
  status: number;
  surveyCount: number;
  createdAt: string;
  lastLogin: string;
}

// ─── 模拟数据 ──────────────────────────────────────────────────
const mockUsers: UserItem[] = [
  {
    id: 1,
    username: "admin_sys",
    email: "admin@q-survey.com",
    role: "super_admin",
    status: 1,
    surveyCount: 156,
    createdAt: "2025-01-15T08:00:00Z",
    lastLogin: "2026-06-23T09:30:00Z"
  },
  {
    id: 2,
    username: "zhangsan",
    email: "zhangsan@example.com",
    role: "admin",
    status: 1,
    surveyCount: 89,
    createdAt: "2025-03-20T10:00:00Z",
    lastLogin: "2026-06-22T14:20:00Z"
  },
  {
    id: 3,
    username: "lisi_dev",
    email: "lisi@dev.com",
    role: "user",
    status: 1,
    surveyCount: 45,
    createdAt: "2025-06-10T14:30:00Z",
    lastLogin: "2026-06-23T08:15:00Z"
  },
  {
    id: 4,
    username: "wangwu",
    email: "wangwu@example.com",
    role: "user",
    status: 0,
    surveyCount: 12,
    createdAt: "2025-08-05T09:15:00Z",
    lastLogin: "2026-05-30T11:00:00Z"
  },
  {
    id: 5,
    username: "zhaoliu",
    email: "zhaoliu@corp.com",
    role: "user",
    status: 1,
    surveyCount: 78,
    createdAt: "2025-09-12T16:00:00Z",
    lastLogin: "2026-06-23T10:45:00Z"
  },
  {
    id: 6,
    username: "sunqi_hr",
    email: "sunqi@hr.com",
    role: "admin",
    status: 1,
    surveyCount: 34,
    createdAt: "2025-11-01T11:00:00Z",
    lastLogin: "2026-06-21T16:30:00Z"
  },
  {
    id: 7,
    username: "zhouba",
    email: "zhouba@test.com",
    role: "user",
    status: 1,
    surveyCount: 8,
    createdAt: "2026-01-18T08:30:00Z",
    lastLogin: "2026-06-20T09:00:00Z"
  },
  {
    id: 8,
    username: "wujiu",
    email: "wujiu@example.com",
    role: "user",
    status: 0,
    surveyCount: 0,
    createdAt: "2026-02-25T13:00:00Z",
    lastLogin: "2026-03-15T12:00:00Z"
  },
  {
    id: 9,
    username: "zhengshi",
    email: "zhengshi@data.cn",
    role: "user",
    status: 1,
    surveyCount: 56,
    createdAt: "2026-04-10T15:20:00Z",
    lastLogin: "2026-06-23T07:00:00Z"
  },
  {
    id: 10,
    username: "liuyi_mgr",
    email: "liuyi@mgmt.com",
    role: "admin",
    status: 1,
    surveyCount: 120,
    createdAt: "2026-05-08T09:40:00Z",
    lastLogin: "2026-06-23T11:10:00Z"
  }
];

// ─── 状态 ──────────────────────────────────────────────────────
const loading = ref(false);
const searchKeyword = ref("");
const currentPage = ref(1);
const pageSize = ref(10);
const formVisible = ref(false);
const formSubmitting = ref(false);
const editingUser = ref<UserItem | null>(null);
const form = ref({ username: "", email: "", password: "", role: "user" });

// ─── 角色映射 ──────────────────────────────────────────────────
function roleLabel(role: string): string {
  const map: Record<string, string> = { super_admin: "超级管理员", admin: "管理员", user: "普通用户" };
  return map[role] ?? role;
}
function roleColor(role: string): string {
  const map: Record<string, string> = { super_admin: "red", admin: "arcoblue", user: "gray" };
  return map[role] ?? "gray";
}

// ─── 格式化日期 ────────────────────────────────────────────────
function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── 筛选 ──────────────────────────────────────────────────────
const filteredUsers = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase();
  if (!kw) return mockUsers;
  return mockUsers.filter(u => u.username.toLowerCase().includes(kw) || u.email.toLowerCase().includes(kw));
});

const pagination = computed(() => ({
  current: currentPage.value,
  pageSize: pageSize.value,
  total: filteredUsers.value.length,
  showTotal: true,
  showPageSize: true,
  pageSizeOptions: [10, 20, 50]
}));

function handleSearch() {
  currentPage.value = 1;
}
function handlePageChange(page: number) {
  currentPage.value = page;
}

// ─── CRUD 操作 ─────────────────────────────────────────────────
function resetForm() {
  form.value = { username: "", email: "", password: "", role: "user" };
  editingUser.value = null;
}

function handleAdd() {
  resetForm();
  formVisible.value = true;
}

function handleEdit(record: UserItem) {
  editingUser.value = record;
  form.value = { username: record.username, email: record.email, password: "", role: record.role };
  formVisible.value = true;
}

function handleFormSubmit() {
  if (!form.value.username || !form.value.email) {
    Message.warning("请填写用户名和邮箱");
    return;
  }
  formSubmitting.value = true;
  setTimeout(() => {
    Message.success(editingUser.value ? "用户信息已更新" : "用户添加成功");
    formSubmitting.value = false;
    formVisible.value = false;
  }, 500);
}

function handleBan(record: UserItem) {
  Modal.confirm({
    title: "确认封禁",
    content: `确定封禁用户「${record.username}」？封禁后该用户将无法登录。`,
    onOk: () => {
      record.status = 0;
      Message.success(`用户「${record.username}」已被封禁`);
    }
  });
}

function handleUnban(record: UserItem) {
  record.status = 1;
  Message.success(`用户「${record.username}」已解封`);
}

function handleDelete(record: UserItem) {
  Modal.confirm({
    title: "确认删除",
    content: `确定永久删除用户「${record.username}」？此操作不可撤销。`,
    onOk: () => {
      Message.success(`用户「${record.username}」已删除`);
    }
  });
}
</script>

<style scoped>
.user-list-page {
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
